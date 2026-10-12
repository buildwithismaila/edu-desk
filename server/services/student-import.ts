import { eq, inArray, isNull } from 'drizzle-orm'
import { createError, getRequestHeader, type H3Event, readMultipartFormData } from 'h3'
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  type ImportError,
  type ImportRow,
  validateImportFile,
} from '../../shared/schemas/student-import'
import { classArmLabel } from '../../shared/utils/academics'
import { classArms, classLevels, departments, studentEnrolments, studentGuardians, students, users } from '../database/schema'
import { CsvError, parseCsv } from '../utils/csv'
import type { Db } from '../utils/db'
import { conflict, isUniqueViolation } from '../utils/errors'
import { generateTemporaryPassword } from '../utils/password'
import { whereSchool } from '../utils/tenant'
import { fieldError } from '../utils/validation'
import { requireSession } from './assignments'
import { nextAdmissionNumber } from './students'

// hashPassword is a Nitro auto-import (tests/helpers/nitro-globals.ts)

type SchoolRef = { id: string }

/** Reads the multipart `file` as CSV: 413 over 1 MB; 400 if missing, not valid CSV or over the row limit. */
export async function readImportFile(event: H3Event) {
  const tooLarge = () => createError({ statusCode: 413, statusMessage: 'Payload Too Large', message: 'The file must be 1 MB or smaller' })
  if (Number(getRequestHeader(event, 'content-length') ?? 0) > IMPORT_MAX_BYTES + 64 * 1024) throw tooLarge()

  const file = (await readMultipartFormData(event))?.find(part => part.name === 'file')
  if (!file?.data.length) throw fieldError('file', 'Choose a CSV file to import')
  if (file.data.length > IMPORT_MAX_BYTES) throw tooLarge()

  let table: string[][]
  try {
    table = parseCsv(new TextDecoder().decode(file.data))
  }
  catch (error) {
    if (error instanceof CsvError) throw fieldError('file', error.message)
    throw error
  }
  if (table.length - 1 > IMPORT_MAX_ROWS) throw fieldError('file', `Import at most ${IMPORT_MAX_ROWS.toLocaleString('en-NG')} students at a time`)
  return table
}

/** Arms by label, departments by name and used admission numbers: what the row validator needs. */
async function loadImportContext(db: Db, school: SchoolRef) {
  const arms = await db.select({ id: classArms.id, name: classArms.name, level: classLevels.name, section: classLevels.section })
    .from(classArms).innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(whereSchool(classArms, school))
  const departmentRows = await db.select({ id: departments.id, name: departments.name }).from(departments).where(whereSchool(departments, school))
  const numbers = await db.select({ admissionNumber: students.admissionNumber }).from(students).where(whereSchool(students, school))
  return {
    arms: new Map(arms.map(a => [classArmLabel(a.level, a.name).toLowerCase().replace(/\s+/g, ' '), { id: a.id, section: a.section }])),
    departments: new Map(departmentRows.map(d => [d.name.toLowerCase(), d.id])),
    existingAdmissionNumbers: new Set(numbers.map(s => s.admissionNumber)),
  }
}

/** Active accounts (any role) with the given phones, by phone. */
async function accountsByPhone(db: Db, school: SchoolRef, phones: string[]) {
  if (!phones.length) return new Map<string, { id: string, role: string }>()
  const rows = await db.select({ id: users.id, role: users.role, phone: users.phone }).from(users)
    .where(whereSchool(users, school, inArray(users.phone, phones), isNull(users.deletedAt)))
  return new Map(rows.map(r => [r.phone!, { id: r.id, role: r.role }]))
}

/**
 * Validates a parsed file against the school: the row rules, then the guardian rules that need the
 * database (a phone must not belong to staff; a new guardian's email must be free). Every error is
 * reported; `rows` are the rows without errors.
 */
export async function checkImport(db: Db, school: SchoolRef, table: string[][]) {
  const session = await requireSession(db, school)
  const { rows, errors } = validateImportFile(table, await loadImportContext(db, school))

  const accounts = await accountsByPhone(db, school, [...new Set(rows.map(r => r.guardian.phone))])
  const newEmails = rows.filter(r => r.guardian.email && !accounts.has(r.guardian.phone)).map(r => r.guardian.email!)
  const takenEmails = new Set(newEmails.length
    ? (await db.select({ email: users.email }).from(users).where(whereSchool(users, school, inArray(users.email, newEmails)))).map(u => u.email)
    : [])
  // A new guardian's email may appear on several rows only with the same phone (siblings)
  const emailPhones = new Map<string, string>()

  const guardianErrors: ImportError[] = []
  for (const { row, guardian } of rows) {
    const account = accounts.get(guardian.phone)
    if (account) {
      if (account.role !== 'parent') guardianErrors.push({ row, column: 'guardianPhone', message: 'This phone number belongs to a staff account' })
      continue
    }
    if (!guardian.email) continue
    if (takenEmails.has(guardian.email)) {
      guardianErrors.push({ row, column: 'guardianEmail', message: 'This email is already used by another account' })
    }
    else if ((emailPhones.get(guardian.email) ?? guardian.phone) !== guardian.phone) {
      guardianErrors.push({ row, column: 'guardianEmail', message: 'This email is given for another guardian phone in the file' })
    }
    else {
      emailPhones.set(guardian.email, guardian.phone)
    }
  }

  const failed = new Set(guardianErrors.map(e => e.row))
  return {
    session,
    rows: rows.filter(r => !failed.has(r.row)),
    errors: [...errors, ...guardianErrors].sort((a, b) => a.row - b.row),
  }
}

/**
 * Imports checked rows in one transaction: students, enrolments in the session, guardians matched by
 * phone (siblings share; existing parents reused, not changed). New parent accounts get a random
 * password that is never shown (the admin resets it when a parent wants to log in).
 */
export async function importStudents(db: Db, school: SchoolRef, session: { id: string, name: string }, rows: ImportRow[]) {
  // One hash for the whole import: nobody knows the password, and hashing per guardian takes too long
  const unusablePasswordHash = await hashPassword(generateTemporaryPassword(32))
  const year = Number(session.name.slice(0, 4))

  try {
    return await db.transaction(async (tx) => {
      const existing = await accountsByPhone(tx, school, [...new Set(rows.map(r => r.guardian.phone))])
      const guardianIds = new Map([...existing].map(([phone, account]) => [phone, account.id]))
      const linked = new Set<string>()
      let guardiansCreated = 0

      // Manual numbers first, so generated ones skip them
      const ordered = [...rows.filter(r => r.admissionNumber), ...rows.filter(r => !r.admissionNumber)]
      for (const { row: _row, classArmId, admissionNumber, guardian, ...bio } of ordered) {
        const [student] = await tx.insert(students).values({
          ...bio,
          schoolId: school.id,
          admissionNumber: admissionNumber ?? await nextAdmissionNumber(tx, school, year),
        }).returning({ id: students.id })
        await tx.insert(studentEnrolments).values({ schoolId: school.id, sessionId: session.id, studentId: student!.id, classArmId })

        let guardianId = guardianIds.get(guardian.phone)
        if (guardianId && existing.has(guardian.phone)) {
          linked.add(guardianId)
        }
        else if (!guardianId) {
          const [created] = await tx.insert(users).values({
            schoolId: school.id,
            role: 'parent',
            name: guardian.name,
            phone: guardian.phone,
            email: guardian.email,
            passwordHash: unusablePasswordHash,
            mustChangePassword: true,
          }).returning({ id: users.id })
          guardianId = created!.id
          guardianIds.set(guardian.phone, guardianId)
          guardiansCreated++
        }
        await tx.insert(studentGuardians).values({ schoolId: school.id, studentId: student!.id, guardianId, relationship: guardian.relationship, isPrimary: true })
      }
      return { imported: rows.length, guardiansCreated, guardiansLinked: linked.size }
    })
  }
  catch (error) {
    // Someone admitted a student or added an account with the same number/phone/email meanwhile
    if (isUniqueViolation(error)) throw conflict('Students or guardians changed while importing. Check the file again, then import.')
    throw error
  }
}

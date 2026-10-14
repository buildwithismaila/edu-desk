import { and, asc, eq, ilike, inArray, isNull, ne, or } from 'drizzle-orm'
import { classArmLabel } from '../../shared/utils/academics'
import { normalisePhone } from '../../shared/utils/phone'
import { academicSessions, classArms, classLevels, studentEnrolments, studentGuardians, students, users } from '../database/schema'
import type { Db } from '../utils/db'
import { conflict, notFound } from '../utils/errors'
import { generateTemporaryPassword } from '../utils/password'
import { whereSchool } from '../utils/tenant'
import { fieldError } from '../utils/validation'

// hashPassword is a Nitro auto-import (tests/helpers/nitro-globals.ts)

type SchoolRef = { id: string }
type Relationship = 'father' | 'mother' | 'guardian' | 'other'
export type GuardianInput = { guardianId: string, relationship: Relationship } | { name: string, phone: string, email: string | null, relationship: Relationship }

const guardianColumns = { id: users.id, name: users.name, phone: users.phone, email: users.email }
/** Guardians = active (non-removed) users with the parent role. */
const isGuardian = and(eq(users.role, 'parent'), isNull(users.deletedAt))

/** Private photo URL (only users allowed to see the student can load it). */
export function studentPhotoUrl(student: { id: string, photoKey: string | null, photoUpdatedAt: Date | null }) {
  return student.photoKey ? `/api/students/${student.id}/photo?v=${student.photoUpdatedAt?.getTime() ?? 0}` : null
}

/** Phone unique among active accounts, email among all (decision 021); 409 otherwise. */
async function assertContactFree(db: Db, school: SchoolRef, { phone, email }: { phone?: string, email?: string | null }, exceptId?: string) {
  const notSelf = exceptId ? ne(users.id, exceptId) : undefined
  if (phone) {
    const [taken] = await db.select({ id: users.id }).from(users).where(whereSchool(users, school, eq(users.phone, phone), isNull(users.deletedAt), notSelf))
    if (taken) throw conflict('This phone number is already used by another account')
  }
  if (email) {
    const [taken] = await db.select({ id: users.id }).from(users).where(whereSchool(users, school, eq(users.email, email), notSelf))
    if (taken) throw conflict('This email is already used by another account')
  }
}

/** New parent account with a one-time temporary password (they must change it at first login). */
export async function createGuardianAccount(db: Db, school: SchoolRef, input: { name: string, phone: string, email: string | null }) {
  await assertContactFree(db, school, input)
  const temporaryPassword = generateTemporaryPassword()
  const [guardian] = await db.insert(users).values({
    ...input,
    schoolId: school.id,
    role: 'parent',
    passwordHash: await hashPassword(temporaryPassword),
    mustChangePassword: true,
    temporaryPasswordAt: new Date(),
  }).returning(guardianColumns)
  return { guardian: guardian!, temporaryPassword }
}

async function findGuardian(db: Db, school: SchoolRef, id: string) {
  const [guardian] = await db.select(guardianColumns).from(users).where(whereSchool(users, school, eq(users.id, id), isGuardian))
  return guardian
}

/** The existing guardian, or a new account; plus the temporary password for a new one. */
export async function resolveGuardian(db: Db, school: SchoolRef, input: GuardianInput) {
  if ('guardianId' in input) {
    const guardian = await findGuardian(db, school, input.guardianId)
    if (!guardian) throw fieldError('guardianId', 'Choose one of your school\'s guardians')
    return { guardian, temporaryPassword: null as string | null }
  }
  return createGuardianAccount(db, school, input)
}

async function findActiveStudent(db: Db, school: SchoolRef, id: string) {
  const [student] = await db.select({ id: students.id }).from(students).where(whereSchool(students, school, eq(students.id, id), isNull(students.deletedAt)))
  if (!student) throw notFound('Student not found')
  return student
}

export async function linkGuardian(db: Db, school: SchoolRef, studentId: string, input: GuardianInput) {
  await findActiveStudent(db, school, studentId)
  return db.transaction(async (tx) => {
    const { guardian, temporaryPassword } = await resolveGuardian(tx, school, input)
    const [linked] = await tx.select({ id: studentGuardians.id }).from(studentGuardians)
      .where(whereSchool(studentGuardians, school, and(eq(studentGuardians.studentId, studentId), eq(studentGuardians.guardianId, guardian.id))))
    if (linked) throw conflict(`${guardian.name} is already this student's guardian`)
    await tx.insert(studentGuardians).values({ schoolId: school.id, studentId, guardianId: guardian.id, relationship: input.relationship })
    return { guardian, temporaryPassword }
  })
}

/** 409 when it's the student's last guardian: every student keeps at least one. */
export async function unlinkGuardian(db: Db, school: SchoolRef, studentId: string, guardianId: string) {
  await findActiveStudent(db, school, studentId)
  const links = await db.select({ guardianId: studentGuardians.guardianId }).from(studentGuardians)
    .where(whereSchool(studentGuardians, school, eq(studentGuardians.studentId, studentId)))
  if (!links.some(l => l.guardianId === guardianId)) throw notFound('This guardian isn\'t linked to the student')
  if (links.length === 1) throw conflict('Every student needs at least one guardian. Add another guardian first.')
  await db.delete(studentGuardians)
    .where(whereSchool(studentGuardians, school, and(eq(studentGuardians.studentId, studentId), eq(studentGuardians.guardianId, guardianId))))
}

/** Up to 20 guardians matching a name, or a phone in any Nigerian format, with their children's names. */
export async function searchGuardians(db: Db, school: SchoolRef, search = '') {
  const phone = search ? normalisePhone(search) : null
  const match = phone ? eq(users.phone, phone) : search ? or(ilike(users.name, `%${search}%`), ilike(users.phone, `%${search.replace(/\D/g, '') || search}%`)) : undefined
  const guardians = await db.select(guardianColumns).from(users).where(whereSchool(users, school, isGuardian, match)).orderBy(asc(users.name)).limit(20)
  if (!guardians.length) return []

  const children = await db.select({ guardianId: studentGuardians.guardianId, firstName: students.firstName, lastName: students.lastName })
    .from(studentGuardians).innerJoin(students, eq(studentGuardians.studentId, students.id))
    .where(whereSchool(studentGuardians, school, inArray(studentGuardians.guardianId, guardians.map(g => g.id)), isNull(students.deletedAt)))
    .orderBy(asc(students.firstName))
  return guardians.map(g => ({ ...g, children: children.filter(c => c.guardianId === g.id).map(c => `${c.firstName} ${c.lastName}`) }))
}

export async function updateGuardian(db: Db, school: SchoolRef, id: string, changes: { name?: string, phone?: string, email?: string | null }) {
  if (!await findGuardian(db, school, id)) throw notFound('Guardian not found')
  await assertContactFree(db, school, changes, id)
  const [guardian] = await db.update(users).set(changes).where(whereSchool(users, school, eq(users.id, id))).returning(guardianColumns)
  return guardian!
}

/** A parent's own (non-removed) children with their class in the current session. */
export async function listMyChildren(db: Db, school: SchoolRef, parentId: string) {
  const rows = await db.select({
    id: students.id,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    photoKey: students.photoKey,
    photoUpdatedAt: students.photoUpdatedAt,
    level: classLevels.name,
    arm: classArms.name,
  })
    .from(studentGuardians)
    .innerJoin(students, eq(studentGuardians.studentId, students.id))
    .leftJoin(academicSessions, and(eq(academicSessions.schoolId, students.schoolId), eq(academicSessions.isCurrent, true)))
    .leftJoin(studentEnrolments, and(eq(studentEnrolments.studentId, students.id), eq(studentEnrolments.sessionId, academicSessions.id)))
    .leftJoin(classArms, eq(studentEnrolments.classArmId, classArms.id))
    .leftJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(whereSchool(studentGuardians, school, eq(studentGuardians.guardianId, parentId), isNull(students.deletedAt)))
    .orderBy(asc(students.firstName))
  return rows.map(r => ({
    id: r.id,
    name: `${r.firstName} ${r.lastName}`,
    admissionNumber: r.admissionNumber,
    classLabel: r.level && r.arm ? classArmLabel(r.level, r.arm) : null,
    photoUrl: studentPhotoUrl({ id: r.id, photoKey: r.photoKey, photoUpdatedAt: r.photoUpdatedAt }),
  }))
}

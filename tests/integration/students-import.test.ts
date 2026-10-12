import { and, count, eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ROLES } from '~~/shared/constants/roles'
import { IMPORT_COLUMNS, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from '~~/shared/schemas/student-import'
import { parseCsv } from '~~/server/utils/csv'
import { admissionCounters, studentEnrolments, studentGuardians, students, users } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createClassArm, createClassLevel, createDepartment, createSession } from '../factories/academics'
import { createSchool } from '../factories/schools'
import { createGuardian, createStudent } from '../factories/students'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'

let db: Db
let app: ReturnType<typeof createTestApp>

const hostOf = (slug: string) => `${slug}.lvh.me:3000`
type SchoolRef = { id: string, slug: string }

let n = 0
const phone = () => `+2348077${String(++n).padStart(6, '0')}`

beforeAll(async () => {
  db = await createTestDb()
})

beforeEach(() => {
  app = createTestApp(db)
})

async function loginAs(role: typeof ROLES[number], school: SchoolRef) {
  const user = await createUser(db, school, { role })
  return app.login(hostOf(school.slug), user.email!, DEFAULT_TEST_PASSWORD)
}

/** "Greenfield Academy" (prefix GA) with a current 2026/2027 session, JSS 1A, SSS 1A and Science. */
async function freshSchool() {
  const school = await createSchool(db, { name: 'Greenfield Academy' })
  const admin = await loginAs('admin', school)
  const { session } = await createSession(db, school, { name: '2026/2027', currentTerm: 'first' })
  const jss1a = await createClassArm(db, school, await createClassLevel(db, school, { section: 'jss', name: 'JSS 1' }), 'A')
  const sss1a = await createClassArm(db, school, await createClassLevel(db, school, { section: 'sss', name: 'SSS 1' }), 'A')
  const science = await createDepartment(db, school, 'Science')
  return { school, admin, session, jss1a, sss1a, science }
}

type Row = Partial<Record<typeof IMPORT_COLUMNS[number], string>>

const row = (overrides: Row = {}): Row => ({
  firstName: 'Ada',
  lastName: 'Obi',
  gender: 'F',
  dateOfBirth: '14/02/2014',
  stateOfOrigin: 'Anambra',
  classArm: 'JSS 1A',
  guardianName: 'Ngozi Obi',
  guardianPhone: phone(),
  guardianRelationship: 'mother',
  ...overrides,
})

const quote = (value: string) => /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
const csv = (rows: Row[]) => [IMPORT_COLUMNS.join(','), ...rows.map(r => IMPORT_COLUMNS.map(c => quote(r[c] ?? '')).join(','))].join('\r\n')

function upload(school: SchoolRef, cookie: string | undefined, text: string | null, { dryRun = false } = {}) {
  const form = new FormData()
  if (text !== null) form.append('file', new Blob([text], { type: 'text/csv' }), 'students.csv')
  return app.request(`/api/students/import${dryRun ? '?dryRun=true' : ''}`, { host: hostOf(school.slug), cookie, method: 'POST', body: form })
}

const studentCount = async (school: SchoolRef) => (await db.select({ c: count() }).from(students).where(eq(students.schoolId, school.id)))[0]!.c
const counterOf = async (school: SchoolRef) => (await db.select().from(admissionCounters).where(eq(admissionCounters.schoolId, school.id)))[0]?.lastNumber ?? 0

describe('permissions', () => {
  it.each(ROLES.map(role => [role, role === 'admin' ? 200 : 403] as const))('POST /api/students/import (dry run) as %s → %i', async (role, status) => {
    const f = await freshSchool()
    expect((await upload(f.school, await loginAs(role, f.school), csv([row()]), { dryRun: true })).status).toBe(status)
  })

  it.each(ROLES.map(role => [role, role === 'admin' ? 200 : 403] as const))('GET /api/students/import/template as %s → %i', async (role, status) => {
    const f = await freshSchool()
    const res = await app.request('/api/students/import/template', { host: hostOf(f.school.slug), cookie: await loginAs(role, f.school) })
    expect(res.status).toBe(status)
  })

  it('returns 401 without a session', async () => {
    const f = await freshSchool()
    expect((await upload(f.school, undefined, csv([row()]))).status).toBe(401)
    expect((await app.request('/api/students/import/template', { host: hostOf(f.school.slug) })).status).toBe(401)
  })

  it('rejects an admin session from another school', async () => {
    const a = await freshSchool()
    const b = await freshSchool()
    expect((await upload(b.school, a.admin, csv([row()]))).status).toBe(401)
    expect(await studentCount(b.school)).toBe(0)
  })
})

describe('GET /api/students/import/template', () => {
  it('downloads a CSV with every column and an example row', async () => {
    const f = await freshSchool()
    const res = await app.request('/api/students/import/template', { host: hostOf(f.school.slug), cookie: f.admin })
    expect(res.headers.get('content-type')).toMatch(/^text\/csv/)
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="students-template\.csv"/)
    const table = parseCsv(await res.text())
    expect(table[0]).toEqual([...IMPORT_COLUMNS])
    expect(table).toHaveLength(2)
  })

  it('has an example row that imports cleanly', async () => {
    const f = await freshSchool()
    const template = await (await app.request('/api/students/import/template', { host: hostOf(f.school.slug), cookie: f.admin })).text()
    expect(await (await upload(f.school, f.admin, template, { dryRun: true })).json()).toEqual({ valid: true, rows: 1, errors: [] })
  })
})

describe('dry run', () => {
  it('reports every error with spreadsheet row numbers and writes nothing', async () => {
    const f = await freshSchool()
    const res = await upload(f.school, f.admin, csv([
      row(),
      row({ gender: 'X', classArm: 'JSS 9Z' }),
      row({ guardianPhone: '123' }),
    ]), { dryRun: true })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.rows).toBe(1)
    expect(body.errors).toEqual([
      { row: 3, column: 'gender', message: expect.any(String) },
      { row: 3, column: 'classArm', message: 'No class arm called "JSS 9Z"' },
      { row: 4, column: 'guardianPhone', message: expect.any(String) },
    ])
    expect(await studentCount(f.school)).toBe(0)
  })

  it('reports a valid file without importing it', async () => {
    const f = await freshSchool()
    const res = await upload(f.school, f.admin, csv([row(), row({ firstName: 'Bola' })]), { dryRun: true })
    expect(await res.json()).toEqual({ valid: true, rows: 2, errors: [] })
    expect(await studentCount(f.school)).toBe(0)
    expect(await counterOf(f.school)).toBe(0)
    expect(await db.select().from(users).where(and(eq(users.schoolId, f.school.id), eq(users.role, 'parent')))).toHaveLength(0)
  })

  it('reports an admission number already used in the school', async () => {
    const f = await freshSchool()
    await createStudent(db, f.school, { admissionNumber: 'GA/2020/0007' })
    const body = await (await upload(f.school, f.admin, csv([row({ admissionNumber: 'ga/2020/0007' })]), { dryRun: true })).json()
    expect(body.errors).toEqual([{ row: 2, column: 'admissionNumber', message: 'ga/2020/0007 is already used' }])
  })

  it('reports a guardian phone that belongs to a staff account', async () => {
    const f = await freshSchool()
    const teacher = await createUser(db, f.school, { role: 'teacher', phone: '+2348099000001' })
    const body = await (await upload(f.school, f.admin, csv([row({ guardianPhone: '08099000001' })]), { dryRun: true })).json()
    expect(teacher.phone).toBe('+2348099000001')
    expect(body.errors).toEqual([{ row: 2, column: 'guardianPhone', message: 'This phone number belongs to a staff account' }])
  })

  it('reports a new guardian\'s email that another account uses', async () => {
    const f = await freshSchool()
    await createUser(db, f.school, { role: 'teacher', email: 'taken@example.test' })
    const body = await (await upload(f.school, f.admin, csv([row({ guardianEmail: 'taken@example.test' })]), { dryRun: true })).json()
    expect(body.errors).toEqual([{ row: 2, column: 'guardianEmail', message: 'This email is already used by another account' }])
  })

  it('needs a current session', async () => {
    const school = await createSchool(db)
    const admin = await loginAs('admin', school)
    const res = await upload(school, admin, csv([row()]), { dryRun: true })
    expect(res.status).toBe(400)
    expect((await res.json()).data.fieldErrors.sessionId).toEqual(['Set a current term first'])
  })
})

describe('file checks', () => {
  it('returns 400 when no file is sent', async () => {
    const f = await freshSchool()
    const res = await upload(f.school, f.admin, null)
    expect(res.status).toBe(400)
    expect((await res.json()).data.fieldErrors.file).toEqual(['Choose a CSV file to import'])
  })

  it('returns 400 for a file that isn\'t valid CSV', async () => {
    const f = await freshSchool()
    const res = await upload(f.school, f.admin, `${IMPORT_COLUMNS.join(',')}\n"Ada,Obi`)
    expect(res.status).toBe(400)
    expect((await res.json()).data.fieldErrors.file[0]).toMatch(/quote/i)
  })

  it('returns 400 for more than the row limit', async () => {
    const f = await freshSchool()
    const rows = Array.from({ length: IMPORT_MAX_ROWS + 1 }, () => row({ guardianPhone: '08031234567' }))
    const res = await upload(f.school, f.admin, csv(rows), { dryRun: true })
    expect(res.status).toBe(400)
    expect((await res.json()).data.fieldErrors.file).toEqual([`Import at most ${IMPORT_MAX_ROWS.toLocaleString('en-NG')} students at a time`])
  })

  it('returns 413 for a file over 1 MB', async () => {
    const f = await freshSchool()
    const res = await upload(f.school, f.admin, `${csv([row()])}\r\n${'x'.repeat(IMPORT_MAX_BYTES)}`, { dryRun: true })
    expect(res.status).toBe(413)
  })
})

describe('POST /api/students/import', () => {
  it('imports nothing when any row has an error (400 with the errors, counter unchanged)', async () => {
    const f = await freshSchool()
    const res = await upload(f.school, f.admin, csv([row(), row(), row({ classArm: 'Nowhere' })]))
    expect(res.status).toBe(400)
    expect((await res.json()).data.errors).toEqual([{ row: 4, column: 'classArm', message: 'No class arm called "Nowhere"' }])
    expect(await studentCount(f.school)).toBe(0)
    expect(await counterOf(f.school)).toBe(0)
    expect(await db.select().from(users).where(and(eq(users.schoolId, f.school.id), eq(users.role, 'parent')))).toHaveLength(0)
  })

  it('imports every student with enrolment in the current session, bio fields and a new guardian', async () => {
    const f = await freshSchool()
    const guardianPhone = phone()
    const res = await upload(f.school, f.admin, csv([
      row({ firstName: 'Ada', middleName: 'Chioma', lga: 'Awka South', address: '1 Zik Ave, Awka', guardianPhone, guardianEmail: 'ngozi@example.test' }),
      row({ firstName: 'Tunde', lastName: 'Bello', gender: 'male', classArm: 'sss 1a', department: 'science' }),
    ]))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ imported: 2, guardiansCreated: 2, guardiansLinked: 0 })

    const imported = await db.select().from(students).where(eq(students.schoolId, f.school.id))
    const ada = imported.find(s => s.firstName === 'Ada')!
    expect(ada).toMatchObject({ middleName: 'Chioma', lastName: 'Obi', gender: 'female', dateOfBirth: '2014-02-14', stateOfOrigin: 'Anambra', lga: 'Awka South', address: '1 Zik Ave, Awka', departmentId: null })
    const tunde = imported.find(s => s.firstName === 'Tunde')!
    expect(tunde.departmentId).toBe(f.science.id)

    const enrolments = await db.select().from(studentEnrolments).where(eq(studentEnrolments.schoolId, f.school.id))
    expect(enrolments.map(e => [e.studentId, e.classArmId, e.sessionId])).toEqual(expect.arrayContaining([
      [ada.id, f.jss1a.id, f.session.id],
      [tunde.id, f.sss1a.id, f.session.id],
    ]))

    const [link] = await db.select().from(studentGuardians).where(eq(studentGuardians.studentId, ada.id))
    expect(link).toMatchObject({ relationship: 'mother', isPrimary: true })
    const [guardian] = await db.select().from(users).where(eq(users.id, link!.guardianId))
    expect(guardian).toMatchObject({ schoolId: f.school.id, role: 'parent', name: 'Ngozi Obi', phone: guardianPhone, email: 'ngozi@example.test', mustChangePassword: true })
  })

  it('matches guardians by phone: siblings share one, an existing parent is reused', async () => {
    const f = await freshSchool()
    const existing = await createGuardian(db, f.school, { name: 'Musa Bello', phone: '+2348031230001' })
    const sharedPhone = phone()

    const res = await upload(f.school, f.admin, csv([
      row({ firstName: 'Ada', guardianName: 'Ngozi Obi', guardianPhone: sharedPhone }),
      row({ firstName: 'Chidi', guardianName: 'Ngozi Obi', guardianPhone: sharedPhone.replace('+234', '0') }),
      row({ firstName: 'Tunde', lastName: 'Bello', guardianName: 'Mr Bello', guardianPhone: '0803 123 0001', guardianRelationship: 'father' }),
    ]))
    expect(await res.json()).toEqual({ imported: 3, guardiansCreated: 1, guardiansLinked: 1 })

    const parents = await db.select().from(users).where(and(eq(users.schoolId, f.school.id), eq(users.role, 'parent')))
    expect(parents).toHaveLength(2)
    const links = await db.select({ studentId: studentGuardians.studentId, guardianId: studentGuardians.guardianId }).from(studentGuardians).where(eq(studentGuardians.schoolId, f.school.id))
    const shared = parents.find(p => p.phone === sharedPhone)!
    expect(links.filter(l => l.guardianId === shared.id)).toHaveLength(2)
    expect(links.filter(l => l.guardianId === existing.id)).toHaveLength(1)
    // The existing parent's details aren't overwritten by the file
    expect(parents.find(p => p.id === existing.id)!.name).toBe('Musa Bello')
  })

  it('mixes manual and generated admission numbers without collisions', async () => {
    const f = await freshSchool()
    const res = await upload(f.school, f.admin, csv([
      row({ firstName: 'Generated' }),
      row({ firstName: 'Manual', admissionNumber: 'GA/2026/0001' }),
      row({ firstName: 'Old', admissionNumber: 'OLD-17' }),
    ]))
    expect(res.status).toBe(200)

    const numbers = Object.fromEntries((await db.select().from(students).where(eq(students.schoolId, f.school.id))).map(s => [s.firstName, s.admissionNumber]))
    expect(numbers).toEqual({ Generated: 'GA/2026/0002', Manual: 'GA/2026/0001', Old: 'OLD-17' })
    expect(await counterOf(f.school)).toBe(2)
  })

  it('only touches the host school: arms, guardians and students of another school are ignored', async () => {
    const a = await freshSchool()
    const other = await createSchool(db)
    await createClassArm(db, other, await createClassLevel(db, other, { section: 'jss', name: 'JSS 2' }), 'B')
    const otherParent = await createGuardian(db, other, { phone: '+2348031230099' })

    const bad = await (await upload(a.school, a.admin, csv([row({ classArm: 'JSS 2B' })]), { dryRun: true })).json()
    expect(bad.errors).toEqual([{ row: 2, column: 'classArm', message: 'No class arm called "JSS 2B"' }])

    const res = await upload(a.school, a.admin, csv([row({ guardianPhone: '+2348031230099' })]))
    expect(await res.json()).toEqual({ imported: 1, guardiansCreated: 1, guardiansLinked: 0 })
    expect(await studentCount(other)).toBe(0)
    const [link] = await db.select().from(studentGuardians).where(eq(studentGuardians.schoolId, a.school.id))
    expect(link!.guardianId).not.toBe(otherParent.id)
  })
})

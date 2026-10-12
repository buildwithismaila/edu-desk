import { and, eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ROLES } from '~~/shared/constants/roles'
import { admissionCounters, schools, studentEnrolments, studentGuardians, students, users } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createClassArm, createClassLevel, createDepartment, createSession } from '../factories/academics'
import { createSchool, createTwoSchools } from '../factories/schools'
import { createGuardian } from '../factories/students'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'

let db: Db
let app: ReturnType<typeof createTestApp>
let schoolB: Awaited<ReturnType<typeof createTwoSchools>>['schoolB']

const hostOf = (slug: string) => `${slug}.lvh.me:3000`
type SchoolRef = { id: string, slug: string }

let n = 0
const phone = () => `+2348066${String(++n).padStart(6, '0')}`

beforeAll(async () => {
  db = await createTestDb()
  ;({ schoolB } = await createTwoSchools(db))
})

beforeEach(() => {
  app = createTestApp(db)
})

async function loginAs(role: typeof ROLES[number], school: SchoolRef) {
  const user = await createUser(db, school, { role })
  return app.login(hostOf(school.slug), user.email, DEFAULT_TEST_PASSWORD)
}

const admit = (school: SchoolRef, cookie: string | undefined, body: unknown) =>
  app.request('/api/students', { host: hostOf(school.slug), cookie, method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

/** A school (name "Greenfield Academy" → default prefix GA) with a current 2026/2027 session, JSS 1A and SSS 1A. */
async function freshSchool() {
  const school = await createSchool(db, { name: 'Greenfield Academy' })
  const admin = await loginAs('admin', school)
  const { session } = await createSession(db, school, { name: '2026/2027', currentTerm: 'first' })
  const jss1a = await createClassArm(db, school, await createClassLevel(db, school, { section: 'jss', name: 'JSS 1' }), 'A')
  const sss1a = await createClassArm(db, school, await createClassLevel(db, school, { section: 'sss', name: 'SSS 1' }), 'A')
  const science = await createDepartment(db, school, 'Science')
  return { school, admin, session, jss1a, sss1a, science }
}

const body = (arm: { id: string }, overrides: Record<string, unknown> = {}) => ({
  firstName: 'Ada',
  lastName: 'Obi',
  gender: 'female',
  dateOfBirth: '2014-02-14',
  stateOfOrigin: 'Anambra',
  classArmId: arm.id,
  guardians: [{ name: 'Ngozi Obi', phone: phone(), relationship: 'mother' }],
  ...overrides,
})

describe('permissions', () => {
  it.each(ROLES.map(role => [role, role === 'admin' ? 201 : 403] as const))('POST /api/students as %s → %i', async (role, status) => {
    const f = await freshSchool()
    expect((await admit(f.school, await loginAs(role, f.school), body(f.jss1a))).status).toBe(status)
  })

  it('returns 401 without a session', async () => {
    const f = await freshSchool()
    expect((await admit(f.school, undefined, body(f.jss1a))).status).toBe(401)
  })
})

describe('POST /api/students', () => {
  it('admits a student with an admission number, enrolment and a new guardian who can log in', async () => {
    const f = await freshSchool()
    const guardianPhone = phone()

    const res = await admit(f.school, f.admin, body(f.jss1a, { guardians: [{ name: 'Ngozi Obi', phone: guardianPhone, relationship: 'mother' }] }))

    expect(res.status).toBe(201)
    const result = await res.json()
    expect(result.student).toMatchObject({ admissionNumber: 'GA/2026/0001', firstName: 'Ada', lastName: 'Obi', enrolment: { label: 'JSS 1A' } })
    expect(result.newGuardians).toEqual([{ id: expect.any(String), name: 'Ngozi Obi', temporaryPassword: expect.stringMatching(/^.{10}$/) }])

    const [enrolment] = await db.select().from(studentEnrolments).where(eq(studentEnrolments.studentId, result.student.id))
    expect(enrolment).toMatchObject({ sessionId: f.session.id, classArmId: f.jss1a.id })
    const login = await app.postJson('/api/auth/login', { login: guardianPhone, password: result.newGuardians[0].temporaryPassword }, { host: hostOf(f.school.slug) })
    expect(login.status).toBe(200)
  })

  it('numbers admissions in sequence and remembers the prefix', async () => {
    const f = await freshSchool()

    const numbers = []
    for (let i = 0; i < 3; i++) numbers.push((await (await admit(f.school, f.admin, body(f.jss1a))).json()).student.admissionNumber)

    expect(numbers).toEqual(['GA/2026/0001', 'GA/2026/0002', 'GA/2026/0003'])
    const [school] = await db.select().from(schools).where(eq(schools.id, f.school.id))
    expect(school!.admissionPrefix).toBe('GA')
  })

  it('uses the school\'s prefix and skips numbers already typed in manually', async () => {
    const f = await freshSchool()
    await db.update(schools).set({ admissionPrefix: 'GFA' }).where(eq(schools.id, f.school.id))

    await admit(f.school, f.admin, body(f.jss1a, { admissionNumber: 'GFA/2026/0001' }))
    const generated = await (await admit(f.school, f.admin, body(f.jss1a))).json()

    expect(generated.student.admissionNumber).toBe('GFA/2026/0002')
  })

  it('rejects a manual admission number already used (409), ignoring case', async () => {
    const f = await freshSchool()
    await admit(f.school, f.admin, body(f.jss1a, { admissionNumber: 'OLD/123' }))

    const res = await admit(f.school, f.admin, body(f.jss1a, { admissionNumber: 'old/123' }))
    expect(res.status).toBe(409)
    expect((await res.json()).message).toBe('Admission number old/123 is already used')
  })

  it('links an existing guardian so siblings share one, and accepts two guardians', async () => {
    const f = await freshSchool()
    const mother = await createGuardian(db, f.school)

    const res = await admit(f.school, f.admin, body(f.jss1a, { guardians: [{ guardianId: mother.id, relationship: 'mother' }, { name: 'Kunle Obi', phone: phone(), relationship: 'father' }] }))

    const result = await res.json()
    expect(result.newGuardians.map((g: { name: string }) => g.name)).toEqual(['Kunle Obi'])
    const links = await db.select().from(studentGuardians).where(eq(studentGuardians.studentId, result.student.id))
    expect(links.map(l => [l.relationship, l.isPrimary])).toEqual(expect.arrayContaining([['mother', true], ['father', false]]))
  })

  it('accepts a department for an SSS student', async () => {
    const f = await freshSchool()
    const res = await admit(f.school, f.admin, body(f.sss1a, { departmentId: f.science.id }))
    expect((await res.json()).student).toMatchObject({ department: { id: f.science.id, name: 'Science' } })
  })

  it.each([
    ['a department for a JSS student', (f: Awaited<ReturnType<typeof freshSchool>>) => body(f.jss1a, { departmentId: f.science.id }), 'departmentId'],
    ['another school\'s class arm', async () => body(await createClassArm(db, schoolB, await createClassLevel(db, schoolB), 'Z')), 'classArmId'],
    ['another school\'s department', async (f: Awaited<ReturnType<typeof freshSchool>>) => body(f.sss1a, { departmentId: (await createDepartment(db, schoolB)).id }), 'departmentId'],
    ['another school\'s guardian', async (f: Awaited<ReturnType<typeof freshSchool>>) => body(f.jss1a, { guardians: [{ guardianId: (await createGuardian(db, schoolB)).id }] }), 'guardianId'],
  ])('rejects %s (400) and admits nobody', async (_case, makeBody, field) => {
    const f = await freshSchool()

    const res = await admit(f.school, f.admin, await makeBody(f))

    expect(res.status).toBe(400)
    expect(Object.keys((await res.json()).data.fieldErrors)).toContain(field)
    expect(await db.select().from(students).where(eq(students.schoolId, f.school.id))).toEqual([])
  })

  it('is all-or-nothing: a guardian whose phone is taken leaves no student and no counter bump (409)', async () => {
    const f = await freshSchool()
    await admit(f.school, f.admin, body(f.jss1a))
    const teacher = await createUser(db, f.school, { role: 'teacher', phone: phone() })

    const res = await admit(f.school, f.admin, body(f.jss1a, { guardians: [{ name: 'Clash', phone: teacher.phone, relationship: 'father' }] }))

    expect(res.status).toBe(409)
    expect(await db.select().from(students).where(eq(students.schoolId, f.school.id))).toHaveLength(1)
    const [counter] = await db.select().from(admissionCounters).where(and(eq(admissionCounters.schoolId, f.school.id), eq(admissionCounters.year, 2026)))
    expect(counter!.lastNumber).toBe(1)
    expect(await db.select().from(users).where(and(eq(users.schoolId, f.school.id), eq(users.name, 'Clash')))).toEqual([])
  })

  it('returns 400 when there is no current session', async () => {
    const school = await createSchool(db)
    const admin = await loginAs('admin', school)
    const arm = await createClassArm(db, school, await createClassLevel(db, school), 'A')

    expect((await admit(school, admin, body(arm))).status).toBe(400)
  })

  it('admits into the host school even if the body names another', async () => {
    const f = await freshSchool()
    const res = await admit(f.school, f.admin, { ...body(f.jss1a), schoolId: schoolB.id })
    const [row] = await db.select().from(students).where(eq(students.id, (await res.json()).student.id))
    expect(row!.schoolId).toBe(f.school.id)
  })
})

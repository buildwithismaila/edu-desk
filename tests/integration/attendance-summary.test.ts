import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ROLES } from '~~/shared/constants/roles'
import { studentEnrolments } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import type { AttendanceStatus } from '~~/shared/schemas/attendance'
import { assignClassTeacher, createClassArm, createClassLevel, createSession } from '../factories/academics'
import { createRegister } from '../factories/attendance'
import { createSchool } from '../factories/schools'
import { createGuardian, createStudent, enrol } from '../factories/students'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'

let db: Db
let app: ReturnType<typeof createTestApp>

const hostOf = (slug: string) => `${slug}.lvh.me:3000`

beforeAll(async () => {
  db = await createTestDb()
  app = createTestApp(db)
})

type Role = typeof ROLES[number] | 'classTeacher' | 'otherTeacher'

/**
 * JSS 1A (Ada, Bola, Chidi, and Dayo who moved to JSS 1B mid-term), JSS 1B, a removed student,
 * three JSS 1A registers and one JSS 1B register in the first term, one register in the second term.
 */
async function setup() {
  const school = await createSchool(db)
  const { session, terms } = await createSession(db, school, { currentTerm: 'first' })
  const first = terms.find(t => t.number === 'first')!
  const second = terms.find(t => t.number === 'second')!
  const level = await createClassLevel(db, school, { section: 'jss', name: 'JSS 1' })
  const armA = await createClassArm(db, school, level, 'A')
  const armB = await createClassArm(db, school, level, 'B')
  const parentUser = await createGuardian(db, school)
  const ada = await createStudent(db, school, { firstName: 'Ada', lastName: 'Obi', guardians: [parentUser] })
  const bola = await createStudent(db, school, { firstName: 'Bola', lastName: 'Ade' })
  const chidi = await createStudent(db, school, { firstName: 'Chidi', lastName: 'Eze' })
  const dayo = await createStudent(db, school, { firstName: 'Dayo', lastName: 'Lawal' })
  const gone = await createStudent(db, school, { firstName: 'Gone', lastName: 'Away', deletedAt: new Date() })
  for (const student of [ada, bola, chidi, dayo, gone]) await enrol(db, school, { student, session, arm: armA })

  const day = (date: string, arm: { id: string }, marks: [{ id: string }, AttendanceStatus][], term = first) =>
    createRegister(db, school, { term, arm, date, marks: marks.map(([student, status]) => ({ student, status })) })
  await day('2026-10-05', armA, [[ada, 'present'], [bola, 'present'], [chidi, 'absent'], [dayo, 'present'], [gone, 'present']])
  await day('2026-10-06', armA, [[ada, 'absent'], [bola, 'present'], [chidi, 'absent'], [dayo, 'late'], [gone, 'absent']])
  // Dayo moves to JSS 1B
  await db.update(studentEnrolments).set({ classArmId: armB.id }).where(eq(studentEnrolments.studentId, dayo.id))
  await day('2026-10-07', armA, [[ada, 'late'], [bola, 'present'], [chidi, 'present']])
  await day('2026-10-07', armB, [[dayo, 'absent']])
  await day('2027-01-12', armA, [[ada, 'absent'], [bola, 'absent'], [chidi, 'absent']], second)

  const users = {
    admin: await createUser(db, school, { role: 'admin' }),
    principal: await createUser(db, school, { role: 'principal' }),
    classTeacher: await createUser(db, school, { role: 'teacher' }),
    otherTeacher: await createUser(db, school, { role: 'teacher' }),
    bursar: await createUser(db, school, { role: 'bursar' }),
  }
  await assignClassTeacher(db, school, { session, arm: armA, user: users.classTeacher })
  const cookies = {} as Record<Role, string>
  for (const [role, user] of Object.entries(users)) cookies[role as Role] = await app.login(hostOf(school.slug), user.email!, DEFAULT_TEST_PASSWORD)
  cookies.parent = await app.login(hostOf(school.slug), parentUser.email!, DEFAULT_TEST_PASSWORD)

  return { school, session, first, second, armA, armB, students: { ada, bola, chidi, dayo }, cookies }
}
type Fixture = Awaited<ReturnType<typeof setup>>

const summary = (f: Fixture, cookie: string | undefined, query: string) =>
  app.request(`/api/attendance/summary?${query}`, { host: hostOf(f.school.slug), cookie })
const studentAttendance = (f: Fixture, cookie: string | undefined, studentId: string, query = '') =>
  app.request(`/api/students/${studentId}/attendance${query}`, { host: hostOf(f.school.slug), cookie })

let f: Fixture
beforeAll(async () => {
  f = await setup()
})

describe('permissions', () => {
  const ROUTE_ROLES: Role[] = ['admin', 'principal', 'classTeacher', 'otherTeacher', 'bursar', 'parent']

  it.each(ROUTE_ROLES.map(role => [role, ['admin', 'principal', 'classTeacher'].includes(role) ? 200 : 403] as const))('GET /api/attendance/summary as %s → %i', async (role, status) => {
    expect((await summary(f, f.cookies[role], `classArmId=${f.armA.id}`)).status).toBe(status)
  })

  // The other teacher can't see the student at all (Phase 4 rule: 404, not 403)
  it.each(ROUTE_ROLES.map(role => [role, { admin: 200, principal: 200, classTeacher: 200, otherTeacher: 404, bursar: 403, parent: 403 }[role as string]] as const))('GET /api/students/:id/attendance as %s → %i', async (role, status) => {
    expect((await studentAttendance(f, f.cookies[role], f.students.ada.id)).status).toBe(status)
  })

  it('returns 401 without a session', async () => {
    expect((await summary(f, undefined, `classArmId=${f.armA.id}`)).status).toBe(401)
    expect((await studentAttendance(f, undefined, f.students.ada.id)).status).toBe(401)
  })
})

describe('GET /api/attendance/summary', () => {
  it('totals each active student\'s marks for the current term, late counted as present', async () => {
    const body = await (await summary(f, f.cookies.classTeacher, `classArmId=${f.armA.id}`)).json()

    expect(body.term).toMatchObject({ id: f.first.id, number: 'first', sessionName: f.session.name })
    expect(body.arm).toEqual({ id: f.armA.id, label: 'JSS 1A' })
    expect(body.registers).toBe(3)
    expect(body.students.map((s: { name: string }) => s.name)).toEqual(['Bola Ade', 'Chidi Eze', 'Ada Obi'])
    expect(body.students[2]).toEqual({ id: f.students.ada.id, name: 'Ada Obi', admissionNumber: f.students.ada.admissionNumber, opened: 3, present: 2, absent: 1, late: 1, rate: 67 })
    expect(body.students[0]).toMatchObject({ opened: 3, present: 3, rate: 100 })
    expect(body.students[1]).toMatchObject({ opened: 3, present: 1, absent: 2, rate: 33 })
  })

  it('counts both arms for a student who moved mid-term, and leaves out removed students', async () => {
    const body = await (await summary(f, f.cookies.admin, `classArmId=${f.armB.id}`)).json()

    expect(body.registers).toBe(1)
    expect(body.students).toEqual([expect.objectContaining({ name: 'Dayo Lawal', opened: 3, present: 2, absent: 1, late: 1 })])
    const inA = await (await summary(f, f.cookies.admin, `classArmId=${f.armA.id}`)).json()
    expect(inA.students.map((s: { name: string }) => s.name)).not.toContain('Gone Away')
  })

  it('gives another term on request', async () => {
    const body = await (await summary(f, f.cookies.admin, `classArmId=${f.armA.id}&termId=${f.second.id}`)).json()
    expect(body.registers).toBe(1)
    expect(body.students.find((s: { name: string }) => s.name === 'Ada Obi')).toMatchObject({ opened: 1, present: 0, absent: 1, rate: 0 })
  })

  it('validates the query', async () => {
    expect((await summary(f, f.cookies.admin, '')).status).toBe(400)
    expect((await summary(f, f.cookies.admin, 'classArmId=nope')).status).toBe(400)
    expect((await summary(f, f.cookies.admin, `classArmId=${f.armA.id}&termId=00000000-0000-4000-8000-000000000000`)).status).toBe(404)
  })
})

describe('GET /api/students/:id/attendance', () => {
  it('gives the student\'s term summary and the dates they were absent or late', async () => {
    const body = await (await studentAttendance(f, f.cookies.admin, f.students.dayo.id)).json()

    expect(body).toEqual({
      term: expect.objectContaining({ id: f.first.id, number: 'first' }),
      opened: 3,
      present: 2,
      absent: 1,
      late: 1,
      rate: 67,
      absentDates: ['2026-10-07'],
      lateDates: ['2026-10-06'],
    })
  })

  it('has nothing for a student never marked; a removed student is not found', async () => {
    const newcomer = await createStudent(db, f.school)
    await enrol(db, f.school, { student: newcomer, session: f.session, arm: f.armA })
    expect(await (await studentAttendance(f, f.cookies.admin, newcomer.id)).json()).toMatchObject({ opened: 0, rate: null, absentDates: [], lateDates: [] })

    const gone = await createStudent(db, f.school, { deletedAt: new Date() })
    expect((await studentAttendance(f, f.cookies.admin, gone.id)).status).toBe(404)
  })
})

describe('tenant isolation', () => {
  let other: Fixture
  beforeAll(async () => {
    other = await setup()
  })

  it('treats another school\'s arm, term and student as not found', async () => {
    expect((await summary(other, other.cookies.admin, `classArmId=${f.armA.id}`)).status).toBe(404)
    expect((await summary(other, other.cookies.admin, `classArmId=${other.armA.id}&termId=${f.first.id}`)).status).toBe(404)
    expect((await studentAttendance(other, other.cookies.admin, f.students.ada.id)).status).toBe(404)
  })

  it('rejects a School A session on School B\'s host', async () => {
    expect((await summary(other, f.cookies.admin, `classArmId=${other.armA.id}`)).status).toBe(401)
  })
})

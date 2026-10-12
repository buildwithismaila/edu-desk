import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ROLES } from '~~/shared/constants/roles'
import { attendanceMarks, attendanceRegisters, terms } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { assignClassTeacher, assignSubjectTeacher, createClassArm, createClassLevel, createSession, createSubject } from '../factories/academics'
import { createRegister } from '../factories/attendance'
import { createSchool } from '../factories/schools'
import { createStudent, enrol } from '../factories/students'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'

// "Today" is Monday 12/10/2026 in Lagos; only Date is faked (PGlite keeps real timers)
const TODAY = '2026-10-12'

let db: Db
let app: ReturnType<typeof createTestApp>

const hostOf = (slug: string) => `${slug}.lvh.me:3000`

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${TODAY}T09:00:00+01:00`) })
  db = await createTestDb()
  // Nested beforeAll hooks log users in before the first beforeEach
  app = createTestApp(db)
})

afterAll(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  app = createTestApp(db)
})

type Role = typeof ROLES[number] | 'classTeacher' | 'otherTeacher'

/**
 * A school with a current first term (14/09–18/12/2026), JSS 1A (class teacher + a subject teacher,
 * three students) and JSS 1B (one student), and a logged-in user per role.
 */
async function setup() {
  const school = await createSchool(db)
  const { session, terms: sessionTerms } = await createSession(db, school, { currentTerm: 'first' })
  const term = sessionTerms.find(t => t.number === 'first')!
  await db.update(terms).set({ startsOn: '2026-09-14', endsOn: '2026-12-18' }).where(eq(terms.id, term.id))
  const level = await createClassLevel(db, school, { section: 'jss', name: 'JSS 1' })
  const armA = await createClassArm(db, school, level, 'A')
  const armB = await createClassArm(db, school, level, 'B')
  const roster = [
    await createStudent(db, school, { firstName: 'Ada', lastName: 'Obi' }),
    await createStudent(db, school, { firstName: 'Bola', lastName: 'Ade' }),
    await createStudent(db, school, { firstName: 'Chidi', lastName: 'Eze' }),
  ]
  for (const student of roster) await enrol(db, school, { student, session, arm: armA })
  const inB = await createStudent(db, school)
  await enrol(db, school, { student: inB, session, arm: armB })

  const users = {
    admin: await createUser(db, school, { role: 'admin' }),
    principal: await createUser(db, school, { role: 'principal' }),
    classTeacher: await createUser(db, school, { role: 'teacher', name: 'Tunde Adeyemi' }),
    otherTeacher: await createUser(db, school, { role: 'teacher' }),
    teacher: await createUser(db, school, { role: 'teacher' }),
    bursar: await createUser(db, school, { role: 'bursar' }),
    parent: await createUser(db, school, { role: 'parent' }),
  }
  await assignClassTeacher(db, school, { session, arm: armA, user: users.classTeacher })
  // A subject teacher of the arm is still not allowed to take its register
  await assignSubjectTeacher(db, school, { session, arm: armA, user: users.otherTeacher, subject: await createSubject(db, school) })

  const cookies = {} as Record<Role, string>
  for (const [role, user] of Object.entries(users)) cookies[role as Role] = await app.login(hostOf(school.slug), user.email!, DEFAULT_TEST_PASSWORD)
  return { school, session, term, armA, armB, roster, inB, users, cookies }
}
type Fixture = Awaited<ReturnType<typeof setup>>

const allPresent = (roster: { id: string }[]) => roster.map(s => ({ studentId: s.id, status: 'present' }))

function put(f: Fixture, cookie: string | undefined, body: Record<string, unknown>) {
  return app.request('/api/attendance/register', {
    host: hostOf(f.school.slug), cookie, method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}
const getRegister = (f: Fixture, cookie: string | undefined, query: string) =>
  app.request(`/api/attendance/register?${query}`, { host: hostOf(f.school.slug), cookie })

const registersOf = (arm: { id: string }) => db.select().from(attendanceRegisters).where(eq(attendanceRegisters.classArmId, arm.id))

describe('permissions', () => {
  let f: Fixture
  beforeAll(async () => {
    f = await setup()
  })

  const ROUTE_ROLES: Role[] = ['admin', 'principal', 'classTeacher', 'otherTeacher', 'bursar', 'parent']

  it.each(ROUTE_ROLES.map(role => [role, ['bursar', 'parent'].includes(role) ? 403 : 200] as const))('GET /api/attendance/arms as %s → %i', async (role, status) => {
    expect((await app.request('/api/attendance/arms', { host: hostOf(f.school.slug), cookie: f.cookies[role] })).status).toBe(status)
  })

  it.each(ROUTE_ROLES.map(role => [role, ['admin', 'principal', 'classTeacher'].includes(role) ? 200 : 403] as const))('GET /api/attendance/register as %s → %i', async (role, status) => {
    expect((await getRegister(f, f.cookies[role], `classArmId=${f.armA.id}`)).status).toBe(status)
  })

  it.each(ROUTE_ROLES.map(role => [role, ['admin', 'principal', 'classTeacher'].includes(role)] as const))('PUT /api/attendance/register as %s (allowed: %s)', async (role, allowed) => {
    const before = (await registersOf(f.armA)).length
    const res = await put(f, f.cookies[role], { classArmId: f.armA.id, date: TODAY, marks: allPresent(f.roster) })
    if (allowed) {
      expect([200, 201]).toContain(res.status)
    }
    else {
      expect(res.status).toBe(403)
      expect(await registersOf(f.armA)).toHaveLength(before)
    }
  })

  it.each(ROUTE_ROLES.map(role => [role, ['admin', 'principal'].includes(role) ? 200 : 403] as const))('DELETE /api/attendance/registers/:id as %s → %i', async (role, status) => {
    const register = await createRegister(db, f.school, { term: f.term, arm: f.armB, date: `2026-09-${String(15 + ROUTE_ROLES.indexOf(role)).padStart(2, '0')}` })
    const res = await app.request(`/api/attendance/registers/${register.id}`, { host: hostOf(f.school.slug), cookie: f.cookies[role], method: 'DELETE' })
    expect(res.status).toBe(status)
    expect(await db.select().from(attendanceRegisters).where(eq(attendanceRegisters.id, register.id))).toHaveLength(status === 200 ? 0 : 1)
  })

  it('returns 401 without a session on every route', async () => {
    expect((await app.request('/api/attendance/arms', { host: hostOf(f.school.slug) })).status).toBe(401)
    expect((await getRegister(f, undefined, `classArmId=${f.armA.id}`)).status).toBe(401)
    expect((await put(f, undefined, { classArmId: f.armA.id, date: TODAY, marks: allPresent(f.roster) })).status).toBe(401)
    const register = await createRegister(db, f.school, { term: f.term, arm: f.armB, date: '2026-09-30' })
    expect((await app.request(`/api/attendance/registers/${register.id}`, { host: hostOf(f.school.slug), method: 'DELETE' })).status).toBe(401)
  })
})

describe('GET /api/attendance/arms', () => {
  it('lists a class teacher\'s own arms with today\'s status; admin sees every arm', async () => {
    const f = await setup()
    const arms = (cookie: string) => app.request('/api/attendance/arms', { host: hostOf(f.school.slug), cookie }).then(r => r.json())

    expect(await arms(f.cookies.classTeacher)).toEqual({ today: TODAY, arms: [{ id: f.armA.id, label: 'JSS 1A', students: 3, taken: false }] })
    expect((await arms(f.cookies.otherTeacher)).arms).toEqual([])
    expect((await arms(f.cookies.admin)).arms.map((a: { label: string }) => a.label)).toEqual(['JSS 1A', 'JSS 1B'])

    await put(f, f.cookies.classTeacher, { classArmId: f.armA.id, date: TODAY, marks: allPresent(f.roster) })
    expect((await arms(f.cookies.classTeacher)).arms[0].taken).toBe(true)
  })
})

describe('GET /api/attendance/register', () => {
  it('defaults to today and lists the arm\'s students sorted by surname, unmarked, editable by the class teacher', async () => {
    const f = await setup()

    const body = await (await getRegister(f, f.cookies.classTeacher, `classArmId=${f.armA.id}`)).json()

    expect(body).toMatchObject({
      date: TODAY,
      arm: { id: f.armA.id, label: 'JSS 1A' },
      term: { id: f.term.id, number: 'first', startsOn: '2026-09-14', endsOn: '2026-12-18' },
      register: null,
      canEdit: true,
    })
    expect(body.students.map((s: { name: string, status: null }) => [s.name, s.status])).toEqual([['Bola Ade', null], ['Chidi Eze', null], ['Ada Obi', null]])
    expect(body.students[0]).toEqual({ id: f.roster[1]!.id, name: 'Bola Ade', admissionNumber: f.roster[1]!.admissionNumber, photoUrl: null, status: null })
  })

  it('shows saved marks and who took it; a later-admitted student appears unmarked', async () => {
    const f = await setup()
    await put(f, f.cookies.classTeacher, { classArmId: f.armA.id, date: TODAY, marks: [
      { studentId: f.roster[0]!.id, status: 'absent' },
      { studentId: f.roster[1]!.id, status: 'late' },
      { studentId: f.roster[2]!.id, status: 'present' },
    ] })
    const newcomer = await createStudent(db, f.school, { firstName: 'Zara', lastName: 'Zubairu' })
    await enrol(db, f.school, { student: newcomer, session: f.session, arm: f.armA })

    const body = await (await getRegister(f, f.cookies.admin, `classArmId=${f.armA.id}&date=${TODAY}`)).json()

    expect(body.register).toMatchObject({ takenBy: 'Tunde Adeyemi' })
    expect(body.students.map((s: { name: string, status: string | null }) => [s.name, s.status])).toEqual([
      ['Bola Ade', 'late'], ['Chidi Eze', 'present'], ['Ada Obi', 'absent'], ['Zara Zubairu', null],
    ])
  })

  it('shows a past register read-only to the class teacher, editable to the admin', async () => {
    const f = await setup()
    await createRegister(db, f.school, { term: f.term, arm: f.armA, date: '2026-10-09', marks: f.roster.map(student => ({ student, status: 'present' as const })) })

    expect((await (await getRegister(f, f.cookies.classTeacher, `classArmId=${f.armA.id}&date=2026-10-09`)).json()).canEdit).toBe(false)
    expect((await (await getRegister(f, f.cookies.admin, `classArmId=${f.armA.id}&date=2026-10-09`)).json()).canEdit).toBe(true)
  })

  it('refuses a future date and an invalid arm id', async () => {
    const f = await setup()
    const future = await getRegister(f, f.cookies.admin, `classArmId=${f.armA.id}&date=2026-10-13`)
    expect(future.status).toBe(400)
    expect((await future.json()).data.fieldErrors.date).toEqual(['That date is in the future'])
    expect((await getRegister(f, f.cookies.admin, 'classArmId=nope')).status).toBe(400)
    expect((await getRegister(f, f.cookies.admin, 'classArmId=00000000-0000-4000-8000-000000000000')).status).toBe(404)
  })
})

describe('PUT /api/attendance/register', () => {
  it('takes today\'s register (201), then the class teacher edits it the same day (200)', async () => {
    const f = await setup()

    const first = await put(f, f.cookies.classTeacher, { classArmId: f.armA.id, date: TODAY, marks: allPresent(f.roster) })
    expect(first.status).toBe(201)
    const [register] = await registersOf(f.armA)
    expect(register).toMatchObject({ date: TODAY, termId: f.term.id, takenById: f.users.classTeacher.id, schoolId: f.school.id })

    const marks = allPresent(f.roster).map((m, i) => i === 0 ? { ...m, status: 'absent' } : m)
    const second = await put(f, f.cookies.classTeacher, { classArmId: f.armA.id, date: TODAY, marks })
    expect(second.status).toBe(200)

    expect(await registersOf(f.armA)).toHaveLength(1)
    const saved = await db.select().from(attendanceMarks).where(eq(attendanceMarks.registerId, register!.id))
    expect(saved).toHaveLength(3)
    expect(saved.find(m => m.studentId === f.roster[0]!.id)!.status).toBe('absent')
  })

  it('records who saved last when the principal corrects a register', async () => {
    const f = await setup()
    await put(f, f.cookies.classTeacher, { classArmId: f.armA.id, date: TODAY, marks: allPresent(f.roster) })
    await put(f, f.cookies.principal, { classArmId: f.armA.id, date: TODAY, marks: allPresent(f.roster) })
    const [register] = await registersOf(f.armA)
    expect(register!.takenById).toBe(f.users.principal.id)
  })

  it('never creates two registers for the same arm and day, even when saved at once', async () => {
    const f = await setup()
    const body = { classArmId: f.armA.id, date: TODAY, marks: allPresent(f.roster) }

    const statuses = (await Promise.all([put(f, f.cookies.admin, body), put(f, f.cookies.classTeacher, body)])).map(r => r.status).sort()

    expect(statuses).toEqual([200, 201])
    expect(await registersOf(f.armA)).toHaveLength(1)
  })

  describe('dates', () => {
    let f: Fixture
    beforeAll(async () => {
      f = await setup()
    })
    const dateError = async (cookie: string, date: string) => {
      const res = await put(f, cookie, { classArmId: f.armA.id, date, marks: allPresent(f.roster) })
      expect(res.status).toBe(400)
      return (await res.json()).data.fieldErrors.date
    }

    it('limits the class teacher to today', async () => {
      expect(await dateError(f.cookies.classTeacher, '2026-10-09')).toEqual(['You can only take today\'s register'])
      expect(await dateError(f.cookies.classTeacher, '2026-10-13')).toEqual(['That date is in the future'])
    })

    it('lets the admin back-fill inside the term only', async () => {
      expect((await put(f, f.cookies.admin, { classArmId: f.armA.id, date: '2026-10-09', marks: allPresent(f.roster) })).status).toBe(201)
      expect(await dateError(f.cookies.admin, '2026-09-11')).toEqual(['That date is before this term started'])
      expect(await dateError(f.cookies.admin, '2026-10-13')).toEqual(['That date is in the future'])
    })

    it('needs a current term', async () => {
      const school = await createSchool(db)
      const level = await createClassLevel(db, school)
      const arm = await createClassArm(db, school, level)
      const admin = await createUser(db, school, { role: 'admin' })
      const cookie = await app.login(hostOf(school.slug), admin.email!, DEFAULT_TEST_PASSWORD)
      const res = await app.request('/api/attendance/register', {
        host: hostOf(school.slug), cookie, method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ classArmId: arm.id, date: TODAY, marks: [{ studentId: f.roster[0]!.id, status: 'present' }] }),
      })
      expect(res.status).toBe(400)
      expect((await res.json()).data.fieldErrors.term).toEqual(['Set a current term first'])
    })
  })

  describe('a register must cover exactly the arm\'s students', () => {
    let f: Fixture
    beforeAll(async () => {
      f = await setup()
    })
    const marksError = async (marks: unknown[]) => {
      const res = await put(f, f.cookies.admin, { classArmId: f.armA.id, date: TODAY, marks })
      expect(res.status).toBe(400)
      expect(await registersOf(f.armA)).toHaveLength(0)
      return (await res.json()).data.fieldErrors.marks
    }

    it('refuses a register with a student missing', async () => {
      expect(await marksError(allPresent(f.roster.slice(1)))).toEqual(['Mark every student: Ada Obi is missing'])
    })

    it('refuses another arm\'s student', async () => {
      expect(await marksError([...allPresent(f.roster), { studentId: f.inB.id, status: 'present' }])).toEqual(['Some students aren\'t in this class'])
    })

    it('refuses a student marked twice', async () => {
      expect(await marksError([...allPresent(f.roster), { studentId: f.roster[0]!.id, status: 'absent' }])).toEqual(['Each student can only be marked once'])
    })

    it('leaves removed students out of the register', async () => {
      const removed = await createStudent(db, f.school, { deletedAt: new Date() })
      await enrol(db, f.school, { student: removed, session: f.session, arm: f.armA })

      expect(await marksError([...allPresent(f.roster), { studentId: removed.id, status: 'present' }])).toEqual(['Some students aren\'t in this class'])
      const body = await (await getRegister(f, f.cookies.admin, `classArmId=${f.armA.id}`)).json()
      expect(body.students.map((s: { id: string }) => s.id)).not.toContain(removed.id)
      expect((await put(f, f.cookies.admin, { classArmId: f.armA.id, date: TODAY, marks: allPresent(f.roster) })).status).toBe(201)
    })
  })
})

describe('DELETE /api/attendance/registers/:id', () => {
  it('deletes the register and its marks; an unknown id is 404', async () => {
    const f = await setup()
    await put(f, f.cookies.classTeacher, { classArmId: f.armA.id, date: TODAY, marks: allPresent(f.roster) })
    const [register] = await registersOf(f.armA)

    const res = await app.request(`/api/attendance/registers/${register!.id}`, { host: hostOf(f.school.slug), cookie: f.cookies.admin, method: 'DELETE' })

    expect(res.status).toBe(200)
    expect(await registersOf(f.armA)).toHaveLength(0)
    expect(await db.select().from(attendanceMarks).where(eq(attendanceMarks.registerId, register!.id))).toHaveLength(0)
    expect((await app.request(`/api/attendance/registers/${register!.id}`, { host: hostOf(f.school.slug), cookie: f.cookies.admin, method: 'DELETE' })).status).toBe(404)
  })
})

describe('tenant isolation', () => {
  let a: Fixture
  let b: Fixture
  beforeAll(async () => {
    a = await setup()
    b = await setup()
  })

  it('treats another school\'s arm as not found, for reading and saving', async () => {
    expect((await getRegister(b, b.cookies.admin, `classArmId=${a.armA.id}`)).status).toBe(404)
    expect((await put(b, b.cookies.admin, { classArmId: a.armA.id, date: TODAY, marks: allPresent(a.roster) })).status).toBe(404)
    expect(await registersOf(a.armA)).toHaveLength(0)
  })

  it('refuses another school\'s students in a register', async () => {
    const res = await put(b, b.cookies.admin, { classArmId: b.armA.id, date: TODAY, marks: [...allPresent(b.roster), ...allPresent(a.roster)] })
    expect(res.status).toBe(400)
  })

  it('treats another school\'s register as not found when deleting', async () => {
    const register = await createRegister(db, a.school, { term: a.term, arm: a.armA, date: '2026-09-21' })
    const res = await app.request(`/api/attendance/registers/${register.id}`, { host: hostOf(b.school.slug), cookie: b.cookies.admin, method: 'DELETE' })
    expect(res.status).toBe(404)
    expect(await db.select().from(attendanceRegisters).where(eq(attendanceRegisters.id, register.id))).toHaveLength(1)
  })

  it('rejects a School A session on School B\'s host', async () => {
    expect((await getRegister(b, a.cookies.admin, `classArmId=${b.armA.id}`)).status).toBe(401)
  })

  it('ignores a schoolId in the body', async () => {
    const res = await put(a, a.cookies.admin, { classArmId: a.armB.id, date: TODAY, schoolId: b.school.id, marks: allPresent([a.inB]) })
    expect(res.status).toBe(201)
    const [register] = await registersOf(a.armB)
    expect(register!.schoolId).toBe(a.school.id)
    expect(await db.select().from(attendanceRegisters).where(and(eq(attendanceRegisters.schoolId, b.school.id), eq(attendanceRegisters.classArmId, a.armB.id)))).toHaveLength(0)
  })
})

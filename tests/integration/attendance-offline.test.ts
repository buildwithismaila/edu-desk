import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { attendanceMarks, attendanceRegisters, terms } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { assignClassTeacher, createClassArm, createClassLevel, createSession } from '../factories/academics'
import { createSchool } from '../factories/schools'
import { createStudent, enrol } from '../factories/students'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'

// Registers taken offline on a teacher's phone and sent later (docs/features/10c-offline-attendance.md).
// "Today" is Monday 12/10/2026 in Lagos; only Date is faked (PGlite keeps real timers).
const TODAY = '2026-10-12'

let db: Db
let app: ReturnType<typeof createTestApp>
const hostOf = (slug: string) => `${slug}.lvh.me:3000`

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${TODAY}T09:00:00+01:00`) })
  db = await createTestDb()
  app = createTestApp(db)
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(() => {
  app = createTestApp(db)
})

/** JSS 1A (Ada, Bola) with its class teacher; an admin; another school's teacher for isolation. */
async function setup() {
  const school = await createSchool(db)
  const { session, terms: sessionTerms } = await createSession(db, school, { currentTerm: 'first' })
  const term = sessionTerms.find(t => t.number === 'first')!
  await db.update(terms).set({ startsOn: '2026-09-14', endsOn: '2026-12-18' }).where(eq(terms.id, term.id))
  const level = await createClassLevel(db, school, { section: 'jss', name: 'JSS 1' })
  const arm = await createClassArm(db, school, level, 'A')
  const roster = [
    await createStudent(db, school, { firstName: 'Ada', lastName: 'Obi' }),
    await createStudent(db, school, { firstName: 'Bola', lastName: 'Ade' }),
  ]
  for (const student of roster) await enrol(db, school, { student, session, arm })
  const teacher = await createUser(db, school, { role: 'teacher' })
  const admin = await createUser(db, school, { role: 'admin' })
  await assignClassTeacher(db, school, { session, arm, user: teacher })
  const cookies = {
    teacher: await app.login(hostOf(school.slug), teacher.email!, DEFAULT_TEST_PASSWORD),
    admin: await app.login(hostOf(school.slug), admin.email!, DEFAULT_TEST_PASSWORD),
  }
  const put = (cookie: string, body: Record<string, unknown>) => app.request('/api/attendance/register', {
    host: hostOf(school.slug), cookie, method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const get = (cookie: string, date: string) => app.request(`/api/attendance/register?classArmId=${arm.id}&date=${date}`, { host: hostOf(school.slug), cookie })
  return { school, session, arm, roster, cookies, put, get }
}
type Fixture = Awaited<ReturnType<typeof setup>>

const marks = (f: Fixture, status = 'present') => f.roster.map(s => ({ studentId: s.id, status }))
const offlineBody = (f: Fixture, date: string, baseVersion: number | null = null, status = 'present') =>
  ({ classArmId: f.arm.id, date, marks: marks(f, status), offline: { baseVersion } })

describe('a register taken offline and sent later', () => {
  it('is accepted up to 3 days late from the class teacher, and labelled as sent late', async () => {
    const f = await setup()
    const res = await f.put(f.cookies.teacher, offlineBody(f, '2026-10-09'))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.register).toMatchObject({ version: 1, sentLateAt: expect.any(String) })
    expect(body.students.map((s: { status: string }) => s.status)).toEqual(['present', 'present'])
  })

  it('is not labelled late when sent the same day', async () => {
    const f = await setup()
    const res = await f.put(f.cookies.teacher, offlineBody(f, TODAY))
    expect(res.status).toBe(201)
    expect((await res.json()).register).toMatchObject({ version: 1, sentLateAt: null })
  })

  it('is refused when more than 3 days old', async () => {
    const f = await setup()
    const res = await f.put(f.cookies.teacher, offlineBody(f, '2026-10-08'))
    expect(res.status).toBe(400)
    expect((await res.json()).data.fieldErrors.date).toEqual(['This register is more than 3 days old. Ask an admin to enter it.'])
  })

  it('leaves online saves unchanged: a class teacher still can\'t send yesterday\'s without `offline`', async () => {
    const f = await setup()
    const res = await f.put(f.cookies.teacher, { classArmId: f.arm.id, date: '2026-10-11', marks: marks(f) })
    expect(res.status).toBe(400)
  })
})

describe('the version check (the school\'s copy wins)', () => {
  it('refuses when the school\'s register changed since the phone last saw it, and returns the school\'s copy', async () => {
    const f = await setup()
    // The phone saw version 1 (taken online this morning)…
    await f.put(f.cookies.teacher, { classArmId: f.arm.id, date: TODAY, marks: marks(f) })
    // …then the admin corrected it (version 2)
    const corrected = await f.put(f.cookies.admin, { classArmId: f.arm.id, date: TODAY, marks: marks(f, 'late') })
    expect((await corrected.json()).register.version).toBe(2)

    const res = await f.put(f.cookies.teacher, offlineBody(f, TODAY, 1, 'absent'))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.message).toBe('This register was changed at school after your phone saved it')
    expect(body.data.register).toMatchObject({ register: { version: 2 }, students: [{ status: 'late' }, { status: 'late' }] })
    // Nothing written
    const stored = await db.select().from(attendanceMarks)
    expect(stored.filter(m => f.roster.some(s => s.id === m.studentId)).map(m => m.status)).toEqual(['late', 'late'])
  })

  it('refuses when the phone saw no register but one exists now', async () => {
    const f = await setup()
    await f.put(f.cookies.admin, { classArmId: f.arm.id, date: '2026-10-09', marks: marks(f) })
    expect((await f.put(f.cookies.teacher, offlineBody(f, '2026-10-09', null))).status).toBe(409)
  })

  it('saves when the version matches, and bumps it', async () => {
    const f = await setup()
    await f.put(f.cookies.teacher, { classArmId: f.arm.id, date: TODAY, marks: marks(f) })
    const res = await f.put(f.cookies.teacher, offlineBody(f, TODAY, 1, 'absent'))
    expect(res.status).toBe(200)
    expect((await res.json()).register.version).toBe(2)
  })

  it('exposes the version and the late label when the register is read', async () => {
    const f = await setup()
    await f.put(f.cookies.teacher, offlineBody(f, '2026-10-10'))
    const body = await (await f.get(f.cookies.admin, '2026-10-10')).json()
    expect(body.register).toMatchObject({ version: 1, sentLateAt: expect.any(String) })
  })
})

describe('when the class changed while the phone was offline', () => {
  it('refuses with the reason, so the teacher reopens the register', async () => {
    const f = await setup()
    const newcomer = await createStudent(db, f.school, { firstName: 'Chidi', lastName: 'Eze' })
    await enrol(db, f.school, { student: newcomer, session: f.session, arm: f.arm })
    const res = await f.put(f.cookies.teacher, offlineBody(f, TODAY))
    expect(res.status).toBe(400)
    expect((await res.json()).data.fieldErrors.marks[0]).toContain('Chidi Eze')
    expect(await db.select().from(attendanceRegisters).where(eq(attendanceRegisters.classArmId, f.arm.id))).toEqual([])
  })
})

describe('validation and access', () => {
  it('checks the offline field', async () => {
    const f = await setup()
    for (const offline of [{ baseVersion: 'x' }, { baseVersion: -1 }, { baseVersion: 1.5 }, 'yes']) {
      expect((await f.put(f.cookies.teacher, { classArmId: f.arm.id, date: TODAY, marks: marks(f), offline })).status).toBe(400)
    }
  })

  it('keeps other schools out (404), as for online saves', async () => {
    const f = await setup()
    const other = await setup()
    expect((await f.put(f.cookies.teacher, { ...offlineBody(other, TODAY) })).status).toBe(404)
  })
})

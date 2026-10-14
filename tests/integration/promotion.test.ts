import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { promotionRuns, studentEnrolments, studentPromotions, terms } from '~~/server/database/schema'
import { setCurrentTerm } from '~~/server/services/calendar'
import type { Db } from '~~/server/utils/db'
import { createClassArm, createClassLevel, createSession } from '../factories/academics'
import { createSchool } from '../factories/schools'
import { createGuardian, createStudent, enrol } from '../factories/students'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'

let db: Db
let app: ReturnType<typeof createTestApp>

beforeAll(async () => {
  db = await createTestDb()
  app = createTestApp(db)
})

const hostOf = (slug: string) => `${slug}.lvh.me:3000`
type Role = 'admin' | 'principal' | 'teacher' | 'bursar' | 'parent'

/**
 * A school in its current session (first term current) with the next session created (not current):
 * JSS 1 (A: Ada, Bola, Chidi, Dayo and a removed student; B: Ebuka), JSS 2 (A only), SSS 3 (A: Femi, Gbenga).
 * Chidi has a parent.
 */
async function promotionFixture({ nextSession = true } = {}) {
  const school = await createSchool(db)
  const { session: from } = await createSession(db, school, { currentTerm: 'first' })
  const to = nextSession ? (await createSession(db, school)).session : null
  const jss1 = await createClassLevel(db, school, { section: 'jss', name: 'JSS 1' })
  const jss2 = await createClassLevel(db, school, { section: 'jss', name: 'JSS 2' })
  const sss3 = await createClassLevel(db, school, { section: 'sss', name: 'SSS 3' })
  const jss1a = await createClassArm(db, school, jss1, 'A')
  const jss1b = await createClassArm(db, school, jss1, 'B')
  const jss2a = await createClassArm(db, school, jss2, 'A')
  const sss3a = await createClassArm(db, school, sss3, 'A')

  const parentUser = await createGuardian(db, school)
  const s = {
    ada: await createStudent(db, school, { firstName: 'Ada', lastName: 'Obi', admissionNumber: 'P/0001' }),
    bola: await createStudent(db, school, { firstName: 'Bola', lastName: 'Ade', admissionNumber: 'P/0002' }),
    chidi: await createStudent(db, school, { firstName: 'Chidi', lastName: 'Eze', admissionNumber: 'P/0003', guardians: [parentUser] }),
    dayo: await createStudent(db, school, { firstName: 'Dayo', lastName: 'Lawal', admissionNumber: 'P/0004' }),
    gone: await createStudent(db, school, { firstName: 'Gone', lastName: 'Away', admissionNumber: 'P/0005', deletedAt: new Date() }),
    ebuka: await createStudent(db, school, { firstName: 'Ebuka', lastName: 'Nnaji', admissionNumber: 'P/0006' }),
    femi: await createStudent(db, school, { firstName: 'Femi', lastName: 'Ola', admissionNumber: 'P/0007' }),
    gbenga: await createStudent(db, school, { firstName: 'Gbenga', lastName: 'Ojo', admissionNumber: 'P/0008' }),
  }
  for (const student of [s.ada, s.bola, s.chidi, s.dayo, s.gone]) await enrol(db, school, { student, session: from, arm: jss1a })
  await enrol(db, school, { student: s.ebuka, session: from, arm: jss1b })
  for (const student of [s.femi, s.gbenga]) await enrol(db, school, { student, session: from, arm: sss3a })

  const users = {
    admin: await createUser(db, school, { role: 'admin', name: 'Adaeze Okafor' }),
    principal: await createUser(db, school, { role: 'principal' }),
    teacher: await createUser(db, school, { role: 'teacher' }),
    bursar: await createUser(db, school, { role: 'bursar' }),
  }
  const cookies = {} as Record<Role, string>
  for (const [role, user] of Object.entries(users)) cookies[role as Role] = await app.login(hostOf(school.slug), user.email!, DEFAULT_TEST_PASSWORD)
  cookies.parent = await app.login(hostOf(school.slug), parentUser.email!, DEFAULT_TEST_PASSWORD)

  const send = (method: string, cookie: string | undefined, path: string, body?: unknown) => app.request(path, {
    host: hostOf(school.slug),
    cookie,
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  return { school, from, to, levels: { jss1, jss2, sss3 }, arms: { jss1a, jss1b, jss2a, sss3a }, s, users, cookies, send }
}
type Fixture = Awaited<ReturnType<typeof promotionFixture>>

/** Ada promoted, Bola repeats in JSS 1B, Chidi withdrawn, Dayo promoted. */
const jss1aBody = (f: Fixture) => ({
  toSessionId: f.to!.id,
  students: [
    { studentId: f.s.ada.id, outcome: 'promoted', toClassArmId: f.arms.jss2a.id },
    { studentId: f.s.bola.id, outcome: 'repeated', toClassArmId: f.arms.jss1b.id },
    { studentId: f.s.chidi.id, outcome: 'withdrawn', toClassArmId: null },
    { studentId: f.s.dayo.id, outcome: 'promoted', toClassArmId: f.arms.jss2a.id },
  ],
})

const nextEnrolments = async (f: Fixture) => (await db.select({ studentId: studentEnrolments.studentId, armId: studentEnrolments.classArmId })
  .from(studentEnrolments).where(and(eq(studentEnrolments.schoolId, f.school.id), eq(studentEnrolments.sessionId, f.to!.id))))
  .map(e => [e.studentId, e.armId]).sort()
const outcomes = (f: Fixture) => db.select().from(studentPromotions).where(eq(studentPromotions.schoolId, f.school.id))

describe('GET /api/promotion', () => {
  it('lists every arm with its students and promotion state, from this session to the next', async () => {
    const f = await promotionFixture()
    const body = await (await f.send('GET', f.cookies.admin, '/api/promotion')).json()

    expect(body.from).toEqual({ id: f.from.id, name: f.from.name })
    expect(body.to).toEqual({ id: f.to!.id, name: f.to!.name })
    expect(body.arms).toEqual([
      { id: f.arms.jss1a.id, label: 'JSS 1A', section: 'jss', students: 4, promotion: null },
      { id: f.arms.jss1b.id, label: 'JSS 1B', section: 'jss', students: 1, promotion: null },
      { id: f.arms.jss2a.id, label: 'JSS 2A', section: 'jss', students: 0, promotion: null },
      { id: f.arms.sss3a.id, label: 'SSS 3A', section: 'sss', students: 2, promotion: null },
    ])
  })

  it('has no target session until the next one is created', async () => {
    const f = await promotionFixture({ nextSession: false })
    expect((await (await f.send('GET', f.cookies.admin, '/api/promotion')).json()).to).toBeNull()
  })
})

describe('GET /api/promotion/[armId]', () => {
  it('defaults to the next level\'s same-name arm', async () => {
    const f = await promotionFixture()
    const body = await (await f.send('GET', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`)).json()

    expect(body).toMatchObject({ arm: { id: f.arms.jss1a.id, label: 'JSS 1A' }, from: { id: f.from.id }, to: { id: f.to!.id }, resultsPublished: false, promotion: null, canUndo: false })
    // The removed student isn't listed
    expect(body.students).toEqual([
      // By surname
      { id: f.s.bola.id, name: 'Bola Ade', admissionNumber: 'P/0002', average: null, enrolledNext: null, outcome: 'promoted', toClassArmId: f.arms.jss2a.id },
      { id: f.s.chidi.id, name: 'Chidi Eze', admissionNumber: 'P/0003', average: null, enrolledNext: null, outcome: 'promoted', toClassArmId: f.arms.jss2a.id },
      { id: f.s.dayo.id, name: 'Dayo Lawal', admissionNumber: 'P/0004', average: null, enrolledNext: null, outcome: 'promoted', toClassArmId: f.arms.jss2a.id },
      { id: f.s.ada.id, name: 'Ada Obi', admissionNumber: 'P/0001', average: null, enrolledNext: null, outcome: 'promoted', toClassArmId: f.arms.jss2a.id },
    ])
    expect(body.arms.map((a: { label: string }) => a.label)).toEqual(['JSS 1A', 'JSS 1B', 'JSS 2A', 'SSS 3A'])
    expect(body.levels.map((l: { name: string }) => l.name)).toEqual(['JSS 1', 'JSS 2', 'SSS 3'])
  })

  it('leaves the target empty without a same-name arm, and graduates the last level', async () => {
    const f = await promotionFixture()
    const b = await (await f.send('GET', f.cookies.admin, `/api/promotion/${f.arms.jss1b.id}`)).json()
    expect(b.students[0]).toMatchObject({ outcome: 'promoted', toClassArmId: null })
    const sss = await (await f.send('GET', f.cookies.admin, `/api/promotion/${f.arms.sss3a.id}`)).json()
    expect(sss.students.map((st: { outcome: string, toClassArmId: string | null }) => [st.outcome, st.toClassArmId])).toEqual([['graduated', null], ['graduated', null]])
  })
})

describe('POST /api/promotion/[armId]', () => {
  it('promotes the class in one go: next-session enrolments for promoted and repeating students, an outcome for everyone', async () => {
    const f = await promotionFixture()
    const res = await f.send('POST', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`, jss1aBody(f))
    expect(res.status).toBe(200)

    expect(await nextEnrolments(f)).toEqual([
      [f.s.ada.id, f.arms.jss2a.id],
      [f.s.bola.id, f.arms.jss1b.id],
      [f.s.dayo.id, f.arms.jss2a.id],
    ].sort())
    expect((await outcomes(f)).map(o => [o.studentId, o.outcome, o.toClassArmId]).sort()).toEqual([
      [f.s.ada.id, 'promoted', f.arms.jss2a.id],
      [f.s.bola.id, 'repeated', f.arms.jss1b.id],
      [f.s.chidi.id, 'withdrawn', null],
      [f.s.dayo.id, 'promoted', f.arms.jss2a.id],
    ].sort())

    const body = await res.json()
    expect(body.promotion).toMatchObject({ by: 'Adaeze Okafor', at: expect.any(String) })
    expect(body.canUndo).toBe(true)
    expect(body.students.find((st: { id: string }) => st.id === f.s.bola.id)).toMatchObject({ outcome: 'repeated', toClassArmId: f.arms.jss1b.id, enrolledNext: 'JSS 1B' })
    const list = await (await f.send('GET', f.cookies.admin, '/api/promotion')).json()
    expect(list.arms[0].promotion).toMatchObject({ by: 'Adaeze Okafor' })
  })

  it('graduates the last class without a next-session enrolment', async () => {
    const f = await promotionFixture()
    const res = await f.send('POST', f.cookies.admin, `/api/promotion/${f.arms.sss3a.id}`, {
      toSessionId: f.to!.id,
      students: [{ studentId: f.s.femi.id, outcome: 'graduated' }, { studentId: f.s.gbenga.id, outcome: 'graduated', toClassArmId: null }],
    })
    expect(res.status).toBe(200)
    expect(await nextEnrolments(f)).toEqual([])
    expect((await outcomes(f)).map(o => o.outcome)).toEqual(['graduated', 'graduated'])
  })

  it('can\'t run twice for the same arm and session (409, nothing changes)', async () => {
    const f = await promotionFixture()
    await f.send('POST', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`, jss1aBody(f))
    const before = await nextEnrolments(f)

    const again = await f.send('POST', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`, { ...jss1aBody(f), students: jss1aBody(f).students.map(st => ({ ...st, outcome: 'withdrawn', toClassArmId: null })) })
    expect(again.status).toBe(409)
    expect((await again.json()).message).toBe('JSS 1A has already been promoted')
    expect(await nextEnrolments(f)).toEqual(before)
    expect(await outcomes(f)).toHaveLength(4)
  })

  it('lets only one of two simultaneous runs through', async () => {
    const f = await promotionFixture()
    const results = await Promise.all([1, 2].map(() => f.send('POST', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`, jss1aBody(f))))
    expect(results.map(r => r.status).sort()).toEqual([200, 409])
    expect(await nextEnrolments(f)).toHaveLength(3)
    expect(await db.select().from(promotionRuns).where(eq(promotionRuns.schoolId, f.school.id))).toHaveLength(1)
  })

  it('needs every student of the class, and only them (400, nothing written)', async () => {
    const f = await promotionFixture()
    const body = jss1aBody(f)
    const missing = await f.send('POST', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`, { ...body, students: body.students.slice(1) })
    expect(missing.status).toBe(400)
    expect((await missing.json()).message).toBe('List every student in JSS 1A exactly once')

    for (const extra of [f.s.ebuka.id, f.s.gone.id]) {
      const res = await f.send('POST', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`, { ...body, students: [...body.students, { studentId: extra, outcome: 'withdrawn' }] })
      expect(res.status).toBe(400)
    }
    const twice = await f.send('POST', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`, { ...body, students: [...body.students, body.students[0]] })
    expect(twice.status).toBe(400)
    expect(await outcomes(f)).toEqual([])
    expect(await nextEnrolments(f)).toEqual([])
  })

  it('rejects invalid rows with per-student errors (400, nothing written)', async () => {
    const f = await promotionFixture()
    const body = jss1aBody(f)
    body.students[0] = { studentId: f.s.ada.id, outcome: 'repeated', toClassArmId: f.arms.jss2a.id }
    body.students[2] = { studentId: f.s.chidi.id, outcome: 'promoted', toClassArmId: null }
    const res = await f.send('POST', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`, body)

    expect(res.status).toBe(400)
    expect((await res.json()).data.rowErrors).toEqual([
      { studentId: f.s.ada.id, message: 'A repeating student stays in JSS 1' },
      { studentId: f.s.chidi.id, message: 'Choose a class' },
    ])
    expect(await outcomes(f)).toEqual([])
    expect(await nextEnrolments(f)).toEqual([])
  })

  it('skips a student already enrolled in the next session', async () => {
    const f = await promotionFixture()
    // The admin already moved Dayo by hand
    await enrol(db, f.school, { student: f.s.dayo, session: f.to!, arm: f.arms.jss1b })
    const view = await (await f.send('GET', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`)).json()
    expect(view.students.find((st: { id: string }) => st.id === f.s.dayo.id).enrolledNext).toBe('JSS 1B')

    const res = await f.send('POST', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`, jss1aBody(f))
    expect(res.status).toBe(200)
    expect((await nextEnrolments(f)).find(([id]) => id === f.s.dayo.id)).toEqual([f.s.dayo.id, f.arms.jss1b.id])
    expect((await outcomes(f)).map(o => o.studentId)).not.toContain(f.s.dayo.id)
    const dayo = (await res.json()).students.find((st: { id: string }) => st.id === f.s.dayo.id)
    expect(dayo).toMatchObject({ outcome: null, enrolledNext: 'JSS 1B' })
  })

  it('promotes only into the next session', async () => {
    const f = await promotionFixture()
    const earlier = (await createSession(db, f.school, { name: '1999/2000' })).session
    const otherSchools = (await createSession(db, await createSchool(db))).session
    for (const toSessionId of [f.from.id, earlier.id, otherSchools.id]) {
      const res = await f.send('POST', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`, { ...jss1aBody(f), toSessionId })
      expect(res.status).toBe(400)
      expect((await res.json()).data.fieldErrors.toSessionId).toEqual([`Promote into the next session, ${f.to!.name}`])
    }
    const none = await promotionFixture({ nextSession: false })
    const res = await none.send('POST', none.cookies.admin, `/api/promotion/${none.arms.jss1a.id}`, { toSessionId: none.from.id, students: [] })
    expect(res.status).toBe(400)
    expect((await res.json()).data.fieldErrors.toSessionId).toEqual(['Create the next session in Calendar first'])
  })

  it('keeps the next session from being deleted once a class graduated into it (409)', async () => {
    const f = await promotionFixture()
    await f.send('POST', f.cookies.admin, `/api/promotion/${f.arms.sss3a.id}`, {
      toSessionId: f.to!.id,
      students: [{ studentId: f.s.femi.id, outcome: 'graduated' }, { studentId: f.s.gbenga.id, outcome: 'graduated' }],
    })
    // No enrolments in it, but the graduation records point at it
    const res = await f.send('DELETE', f.cookies.admin, `/api/sessions/${f.to!.id}`)
    expect(res.status).toBe(409)
    expect((await res.json()).message).toBe('This session has promotion records, so it can\'t be deleted.')
  })

  it('keeps a withdrawn child on their parent\'s account', async () => {
    const f = await promotionFixture()
    await f.send('POST', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`, jss1aBody(f))
    const children = await (await f.send('GET', f.cookies.parent, '/api/me/children')).json()
    expect(children.map((c: { name: string }) => c.name)).toEqual(['Chidi Eze'])
    expect((await f.send('GET', f.cookies.parent, `/api/me/children/${f.s.chidi.id}`)).status).toBe(200)
  })
})

describe('DELETE /api/promotion/[armId] (undo)', () => {
  it('removes the next-session enrolments and outcomes while the next session isn\'t current, so it can run again', async () => {
    const f = await promotionFixture()
    await enrol(db, f.school, { student: f.s.ebuka, session: f.to!, arm: f.arms.jss2a })
    await f.send('POST', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`, jss1aBody(f))

    const res = await f.send('DELETE', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`)
    expect(res.status).toBe(200)
    expect((await res.json()).promotion).toBeNull()
    // Only what the promotion created goes: Ebuka's own enrolment stays
    expect(await nextEnrolments(f)).toEqual([[f.s.ebuka.id, f.arms.jss2a.id]])
    expect(await outcomes(f)).toEqual([])
    expect((await f.send('POST', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`, jss1aBody(f))).status).toBe(200)
  })

  it('is final once the next session is current (409)', async () => {
    const f = await promotionFixture()
    await f.send('POST', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`, jss1aBody(f))
    // The school moves to the new session (as Calendar does)
    const [first] = await db.select().from(terms).where(and(eq(terms.sessionId, f.to!.id), eq(terms.number, 'first')))
    expect(await setCurrentTerm(db, f.school, first!.id)).toBe(true)

    const res = await f.send('DELETE', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`)
    expect(res.status).toBe(409)
    expect((await res.json()).message).toBe('Promotion is final once the new session has started')
    expect(await outcomes(f)).toHaveLength(4)
  })

  it('has nothing to undo for an arm that wasn\'t promoted (404)', async () => {
    const f = await promotionFixture()
    expect((await f.send('DELETE', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`)).status).toBe(404)
  })
})

describe('promotion access', () => {
  let f: Fixture
  let other: Fixture
  beforeAll(async () => {
    f = await promotionFixture()
    other = await promotionFixture()
  })

  const calls = (fx: Fixture) => [
    ['GET', '/api/promotion', undefined],
    ['GET', `/api/promotion/${fx.arms.jss1a.id}`, undefined],
    ['POST', `/api/promotion/${fx.arms.jss1a.id}`, jss1aBody(fx)],
    ['DELETE', `/api/promotion/${fx.arms.jss1a.id}`, undefined],
  ] as const

  it.each(['principal', 'teacher', 'bursar', 'parent'] as const)('refuses %s (403)', async (role) => {
    for (const [method, path, body] of calls(f)) expect([method, path, (await f.send(method, f.cookies[role], path, body)).status]).toEqual([method, path, 403])
  })

  it('asks for a login without a session (401)', async () => {
    for (const [method, path, body] of calls(f)) expect((await f.send(method, undefined, path, body)).status).toBe(401)
  })

  it('treats another school\'s arm as not found and its students and sessions as invalid', async () => {
    for (const method of ['GET', 'POST', 'DELETE'] as const) {
      const res = await f.send(method, f.cookies.admin, `/api/promotion/${other.arms.jss1a.id}`, method === 'POST' ? jss1aBody(f) : undefined)
      expect([method, res.status]).toEqual([method, 404])
    }
    // Another school's student in the list
    const body = jss1aBody(f)
    const res = await f.send('POST', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`, { ...body, students: [...body.students, { studentId: other.s.ada.id, outcome: 'withdrawn' }] })
    expect(res.status).toBe(400)
    // Another school's arm as the target
    const foreignArm = { ...body, students: body.students.map(st => st.toClassArmId === f.arms.jss2a.id ? { ...st, toClassArmId: other.arms.jss2a.id } : st) }
    expect((await f.send('POST', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`, foreignArm)).status).toBe(400)
    expect(await nextEnrolments(f)).toEqual([])
  })

  it('validates the body', async () => {
    for (const body of [{}, { toSessionId: 'x', students: [] }, { toSessionId: f.to!.id, students: [{ studentId: f.s.ada.id, outcome: 'expelled' }] }]) {
      expect((await f.send('POST', f.cookies.admin, `/api/promotion/${f.arms.jss1a.id}`, body)).status).toBe(400)
    }
    expect((await f.send('GET', f.cookies.admin, '/api/promotion/not-a-uuid')).status).toBe(400)
  })
})

import { and, eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ROLES } from '~~/shared/constants/roles'
import { academicSessions, terms } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createSession } from '../factories/academics'
import { createTwoSchools } from '../factories/schools'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'

let db: Db
let app: ReturnType<typeof createTestApp>
let schoolA: Awaited<ReturnType<typeof createTwoSchools>>['schoolA']
let schoolB: Awaited<ReturnType<typeof createTwoSchools>>['schoolB']
let adminA: string

const hostOf = (slug: string) => `${slug}.lvh.me:3000`

let year = 2300
const freshName = () => `${++year}/${year + 1}`

beforeAll(async () => {
  db = await createTestDb()
  ;({ schoolA, schoolB } = await createTwoSchools(db))
})

beforeEach(async () => {
  app = createTestApp(db)
  adminA = await loginAs('admin')
})

async function loginAs(role: typeof ROLES[number], school = schoolA) {
  const user = await createUser(db, school, { role })
  return app.login(hostOf(school.slug), user.email, DEFAULT_TEST_PASSWORD)
}

function call(method: string, path: string, cookie: string | undefined, body?: unknown, slug = schoolA.slug) {
  return app.request(path, {
    host: hostOf(slug),
    cookie,
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
}

const currentRows = async (schoolId: string) => ({
  sessions: await db.select().from(academicSessions).where(and(eq(academicSessions.schoolId, schoolId), eq(academicSessions.isCurrent, true))),
  terms: await db.select().from(terms).where(and(eq(terms.schoolId, schoolId), eq(terms.isCurrent, true))),
})

describe('permissions', () => {
  const adminOnly = (role: string) => role === 'admin' ? 200 : 403

  it.each(ROLES.map(r => [r, r === 'parent' ? 403 : 200] as const))('GET /api/sessions as %s → %i', async (role, status) => {
    expect((await call('GET', '/api/sessions', await loginAs(role))).status).toBe(status)
  })

  it.each(ROLES.map(r => [r, 200] as const))('GET /api/academic/current as %s → %i', async (role, status) => {
    expect((await call('GET', '/api/academic/current', await loginAs(role))).status).toBe(status)
  })

  it.each(ROLES.map(r => [r, r === 'admin' ? 201 : 403] as const))('POST /api/sessions as %s → %i', async (role, status) => {
    expect((await call('POST', '/api/sessions', await loginAs(role), { name: freshName() })).status).toBe(status)
  })

  it.each(ROLES.map(r => [r, adminOnly(r)] as const))('PATCH /api/sessions/:id as %s → %i', async (role, status) => {
    const { session } = await createSession(db, schoolA)
    expect((await call('PATCH', `/api/sessions/${session.id}`, await loginAs(role), { name: freshName() })).status).toBe(status)
  })

  it.each(ROLES.map(r => [r, adminOnly(r)] as const))('DELETE /api/sessions/:id as %s → %i', async (role, status) => {
    const { session } = await createSession(db, schoolA)
    expect((await call('DELETE', `/api/sessions/${session.id}`, await loginAs(role))).status).toBe(status)
  })

  it.each(ROLES.map(r => [r, adminOnly(r)] as const))('PATCH /api/terms/:id as %s → %i', async (role, status) => {
    const { terms: [first] } = await createSession(db, schoolA)
    expect((await call('PATCH', `/api/terms/${first!.id}`, await loginAs(role), { startsOn: '2026-09-14' })).status).toBe(status)
  })

  it.each(ROLES.map(r => [r, adminOnly(r)] as const))('POST /api/terms/:id/set-current as %s → %i', async (role, status) => {
    const { terms: [first] } = await createSession(db, schoolA)
    expect((await call('POST', `/api/terms/${first!.id}/set-current`, await loginAs(role))).status).toBe(status)
  })

  it.each([
    ['GET', '/api/sessions'],
    ['GET', '/api/academic/current'],
    ['POST', '/api/sessions'],
  ])('%s %s without a session → 401', async (method, path) => {
    expect((await call(method, path, undefined)).status).toBe(401)
  })
})

describe('sessions', () => {
  it('creates a session with its First, Second and Third terms', async () => {
    const name = freshName()
    const res = await call('POST', '/api/sessions', adminA, { name: ` ${name} ` })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({ name, isCurrent: false })
    expect(body.terms.map((t: { number: string }) => t.number)).toEqual(['first', 'second', 'third'])

    const [row] = await db.select().from(academicSessions).where(eq(academicSessions.id, body.id))
    expect(row!.schoolId).toBe(schoolA.id)
  })

  it('rejects a duplicate name with 409, but allows it in another school', async () => {
    const name = freshName()
    await call('POST', '/api/sessions', adminA, { name })

    expect((await call('POST', '/api/sessions', adminA, { name })).status).toBe(409)
    expect((await call('POST', '/api/sessions', await loginAs('admin', schoolB), { name }, schoolB.slug)).status).toBe(201)
  })

  it('returns 400 for a badly formatted name', async () => {
    const res = await call('POST', '/api/sessions', adminA, { name: '2026-2027' })
    expect(res.status).toBe(400)
    expect(Object.keys((await res.json()).data.fieldErrors)).toEqual(['name'])
  })

  it('lists only the school\'s sessions, newest first, with terms in order', async () => {
    await createSession(db, schoolB, { name: '2999/3000' })
    const older = await createSession(db, schoolA, { name: '2401/2402' })
    const newer = await createSession(db, schoolA, { name: '2402/2403' })

    const body = await (await call('GET', '/api/sessions', adminA)).json() as { id: string, name: string, terms: { number: string }[] }[]

    expect(body.map(s => s.name)).not.toContain('2999/3000')
    const ids = body.map(s => s.id)
    expect(ids.indexOf(newer.session.id)).toBeLessThan(ids.indexOf(older.session.id))
    expect(body.find(s => s.id === newer.session.id)!.terms.map(t => t.number)).toEqual(['first', 'second', 'third'])
  })

  it('renames a session; another school\'s session is 404 and unchanged', async () => {
    const mine = await createSession(db, schoolA)
    const theirs = await createSession(db, schoolB)
    const name = freshName()

    expect((await call('PATCH', `/api/sessions/${mine.session.id}`, adminA, { name })).status).toBe(200)
    expect((await call('PATCH', `/api/sessions/${theirs.session.id}`, adminA, { name: freshName() })).status).toBe(404)

    const [b] = await db.select().from(academicSessions).where(eq(academicSessions.id, theirs.session.id))
    expect(b!.name).toBe(theirs.session.name)
  })

  it('deletes a session and its terms, but not the current one', async () => {
    const { session } = await createSession(db, schoolA)
    expect((await call('DELETE', `/api/sessions/${session.id}`, adminA)).status).toBe(200)
    expect(await db.select().from(terms).where(eq(terms.sessionId, session.id))).toEqual([])

    await db.update(terms).set({ isCurrent: false }).where(eq(terms.schoolId, schoolA.id))
    await db.update(academicSessions).set({ isCurrent: false }).where(eq(academicSessions.schoolId, schoolA.id))
    const current = await createSession(db, schoolA, { currentTerm: 'first' })
    const res = await call('DELETE', `/api/sessions/${current.session.id}`, adminA)
    expect(res.status).toBe(409)
    expect((await res.json()).message).toMatch(/current/)
  })

  it('returns 404 when deleting another school\'s session, and keeps it', async () => {
    const theirs = await createSession(db, schoolB)
    expect((await call('DELETE', `/api/sessions/${theirs.session.id}`, adminA)).status).toBe(404)
    expect(await db.select().from(academicSessions).where(eq(academicSessions.id, theirs.session.id))).toHaveLength(1)
  })

  it('returns 400 for an id that is not a uuid', async () => {
    expect((await call('PATCH', '/api/sessions/nope', adminA, { name: freshName() })).status).toBe(400)
  })
})

describe('terms', () => {
  it('sets, changes and clears term dates', async () => {
    const { terms: [first] } = await createSession(db, schoolA)
    const path = `/api/terms/${first!.id}`

    let res = await call('PATCH', path, adminA, { startsOn: '2026-09-14', endsOn: '2026-12-18', nextTermBeginsOn: '2027-01-11' })
    expect(await res.json()).toMatchObject({ startsOn: '2026-09-14', endsOn: '2026-12-18', nextTermBeginsOn: '2027-01-11' })

    res = await call('PATCH', path, adminA, { nextTermBeginsOn: null })
    expect(await res.json()).toMatchObject({ startsOn: '2026-09-14', endsOn: '2026-12-18', nextTermBeginsOn: null })
  })

  it('checks the dates together with the ones already saved', async () => {
    const { terms: [first] } = await createSession(db, schoolA)
    const path = `/api/terms/${first!.id}`
    await call('PATCH', path, adminA, { startsOn: '2026-09-14', endsOn: '2026-12-18' })

    const res = await call('PATCH', path, adminA, { endsOn: '2026-09-01' })

    expect(res.status).toBe(400)
    expect(Object.keys((await res.json()).data.fieldErrors)).toEqual(['endsOn'])
    const [row] = await db.select().from(terms).where(eq(terms.id, first!.id))
    expect(row!.endsOn).toBe('2026-12-18')
  })

  it('returns 400 for an invalid date', async () => {
    const { terms: [first] } = await createSession(db, schoolA)
    expect((await call('PATCH', `/api/terms/${first!.id}`, adminA, { startsOn: '2026-02-30' })).status).toBe(400)
  })

  it('returns 404 for another school\'s term', async () => {
    const { terms: [theirs] } = await createSession(db, schoolB)
    expect((await call('PATCH', `/api/terms/${theirs!.id}`, adminA, { startsOn: '2026-09-14' })).status).toBe(404)
  })
})

describe('set current', () => {
  it('makes the term and its session current, and only those', async () => {
    const x = await createSession(db, schoolA)
    const y = await createSession(db, schoolA)

    await call('POST', `/api/terms/${x.terms[2]!.id}/set-current`, adminA)
    let current = await currentRows(schoolA.id)
    expect(current.sessions.map(s => s.id)).toEqual([x.session.id])
    expect(current.terms.map(t => t.id)).toEqual([x.terms[2]!.id])

    const res = await call('POST', `/api/terms/${y.terms[0]!.id}/set-current`, adminA)
    expect(res.status).toBe(200)
    current = await currentRows(schoolA.id)
    expect(current.sessions.map(s => s.id)).toEqual([y.session.id])
    expect(current.terms.map(t => t.id)).toEqual([y.terms[0]!.id])
  })

  it('does not touch another school\'s current term', async () => {
    const theirs = await createSession(db, schoolB)
    await call('POST', `/api/terms/${theirs.terms[0]!.id}/set-current`, await loginAs('admin', schoolB), undefined, schoolB.slug)
    const mine = await createSession(db, schoolA)

    await call('POST', `/api/terms/${mine.terms[1]!.id}/set-current`, adminA)

    expect((await currentRows(schoolB.id)).terms.map(t => t.id)).toEqual([theirs.terms[0]!.id])
  })

  it('returns 404 for another school\'s term and changes nothing', async () => {
    const mine = await createSession(db, schoolA)
    await call('POST', `/api/terms/${mine.terms[0]!.id}/set-current`, adminA)
    const theirs = await createSession(db, schoolB)

    expect((await call('POST', `/api/terms/${theirs.terms[0]!.id}/set-current`, adminA)).status).toBe(404)

    expect((await currentRows(schoolA.id)).terms.map(t => t.id)).toEqual([mine.terms[0]!.id])
    expect(await db.select().from(terms).where(and(eq(terms.id, theirs.terms[0]!.id), eq(terms.isCurrent, true)))).toEqual([])
  })
})

describe('GET /api/academic/current', () => {
  it('returns the current session and term to any logged-in user', async () => {
    const { session, terms: sessionTerms } = await createSession(db, schoolA)
    await call('PATCH', `/api/terms/${sessionTerms[1]!.id}`, adminA, { startsOn: '2027-01-11', endsOn: '2027-04-02' })
    await call('POST', `/api/terms/${sessionTerms[1]!.id}/set-current`, adminA)

    const body = await (await call('GET', '/api/academic/current', await loginAs('parent'))).json()

    expect(body).toEqual({
      session: { id: session.id, name: session.name },
      term: { id: sessionTerms[1]!.id, number: 'second', startsOn: '2027-01-11', endsOn: '2027-04-02', nextTermBeginsOn: null },
    })
  })

  it('returns nulls when the school has no current term', async () => {
    await db.update(terms).set({ isCurrent: false }).where(eq(terms.schoolId, schoolA.id))
    await db.update(academicSessions).set({ isCurrent: false }).where(eq(academicSessions.schoolId, schoolA.id))

    expect(await (await call('GET', '/api/academic/current', adminA)).json()).toEqual({ session: null, term: null })
  })
})

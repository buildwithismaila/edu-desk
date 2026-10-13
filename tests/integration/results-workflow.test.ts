import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { gradeBands, publishedResults, resultStatuses, scoreLocks } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'
import { armBody, armQuery, hostOf, type ResultsFixture, resultsFixture, resultsRequests, type ResultsRole } from '../helpers/results-fixture'

let db: Db
let app: ReturnType<typeof createTestApp>
let http: ReturnType<typeof resultsRequests>

beforeAll(async () => {
  db = await createTestDb()
  app = createTestApp(db)
  http = resultsRequests(app)
})

const statusOf = async (f: ResultsFixture, arm = f.armA) =>
  (await db.select().from(resultStatuses).where(and(eq(resultStatuses.schoolId, f.school.id), eq(resultStatuses.classArmId, arm.id))))[0]?.status ?? 'draft'
const lockOf = async (f: ResultsFixture, arm = f.armA) =>
  (await db.select().from(scoreLocks).where(and(eq(scoreLocks.schoolId, f.school.id), eq(scoreLocks.classArmId, arm.id)))).length
const snapshotsOf = async (f: ResultsFixture) =>
  (await db.select().from(publishedResults).where(eq(publishedResults.schoolId, f.school.id))).length
const subjectTeacherSave = (f: ResultsFixture, value: number) => http.put(f, f.cookies.subjectTeacher, '/api/scores/sheet', {
  ...armBody(f), subjectId: f.maths.id, entries: [{ studentId: f.students.ada.id, componentId: f.components.ca1.id, value }],
})

describe('permissions', () => {
  let f: ResultsFixture
  beforeAll(async () => {
    f = await resultsFixture(db, app)
  })
  const ROLES: ResultsRole[] = ['admin', 'principal', 'classTeacher', 'otherTeacher', 'subjectTeacher', 'bursar', 'parent']
  const viewers = ['admin', 'principal', 'classTeacher']

  it.each(ROLES.map(role => [role, ['bursar', 'parent'].includes(role) ? 403 : 200] as const))('GET /api/results/arms as %s → %i', async (role, status) => {
    expect((await http.get(f, f.cookies[role], '/api/results/arms')).status).toBe(status)
  })

  it.each(ROLES.flatMap(role => ['/api/results', '/api/results/report-cards', '/api/results/broadsheet'].map(path => [path, role, viewers.includes(role) ? 200 : 403] as const)))('GET %s as %s → %i', async (path, role, status) => {
    expect((await http.get(f, f.cookies[role], `${path}?${armQuery(f)}`)).status).toBe(status)
  })

  it.each(['otherTeacher', 'subjectTeacher', 'bursar', 'parent'] as const)('POST /api/results/submit as %s → 403, nothing changes', async (role) => {
    expect((await http.post(f, f.cookies[role], '/api/results/submit', armBody(f))).status).toBe(403)
    expect(await statusOf(f)).toBe('draft')
  })

  it.each(['classTeacher', 'subjectTeacher', 'bursar', 'parent'] as const)('publish, return, unpublish and principal comments as %s → 403', async (role) => {
    for (const path of ['/api/results/publish', '/api/results/unpublish']) expect((await http.post(f, f.cookies[role], path, armBody(f))).status).toBe(403)
    expect((await http.post(f, f.cookies[role], '/api/results/return', { ...armBody(f), reason: 'Check maths' })).status).toBe(403)
    expect((await http.put(f, f.cookies[role], '/api/results/principal-comments', { ...armBody(f), comments: [{ studentId: f.students.ada.id, comment: 'x' }] })).status).toBe(403)
  })

  it('returns 401 without a session', async () => {
    expect((await http.get(f, undefined, `/api/results?${armQuery(f)}`)).status).toBe(401)
    expect((await http.post(f, undefined, '/api/results/submit', armBody(f))).status).toBe(401)
    expect((await http.get(f, undefined, `/api/students/${f.students.ada.id}/report-card`)).status).toBe(401)
  })
})

describe('GET /api/results/arms', () => {
  it('lists the class teacher\'s arms, and every arm for the principal, with status', async () => {
    const f = await resultsFixture(db, app)
    const arms = async (cookie: string) => (await (await http.get(f, cookie, '/api/results/arms')).json()).arms
    expect(await arms(f.cookies.classTeacher)).toEqual([{ id: f.armA.id, label: 'JSS 1A', section: 'jss', status: 'draft' }])
    expect(await arms(f.cookies.subjectTeacher)).toEqual([])
    expect((await arms(f.cookies.principal)).map((a: { label: string }) => a.label)).toEqual(['JSS 1A', 'JSS 1B'])
  })
})

describe('submit', () => {
  it('refuses incomplete results, naming what\'s missing', async () => {
    const f = await resultsFixture(db, app, { complete: false })
    const res = await http.post(f, f.cookies.classTeacher, '/api/results/submit', armBody(f))
    expect(res.status).toBe(400)
    expect((await res.json()).data.completeness).toEqual([
      { subjectId: f.english.id, subjectName: 'English Language', missing: [{ studentId: f.students.chidi.id, name: 'Chidi Eze', components: ['Exam'] }] },
    ])
    expect(await statusOf(f)).toBe('draft')
    expect((await (await http.get(f, f.cookies.classTeacher, `/api/results?${armQuery(f)}`)).json()).completeness).toHaveLength(1)
  })

  it('submits complete results, locking the scores; submitting again is a conflict', async () => {
    const f = await resultsFixture(db, app)
    const res = await http.post(f, f.cookies.classTeacher, '/api/results/submit', armBody(f))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'submitted', submitted: { by: 'Tunde Adeyemi' }, completeness: [] })
    expect(await lockOf(f)).toBe(1)
    expect((await subjectTeacherSave(f, 5)).status).toBe(409)

    const again = await http.post(f, f.cookies.classTeacher, '/api/results/submit', armBody(f))
    expect(again.status).toBe(409)
    expect((await again.json()).message).toBe('These results are already submitted')
  })
})

describe('publish, return and unpublish', () => {
  it('publishes submitted results as frozen snapshots', async () => {
    const f = await resultsFixture(db, app)
    expect((await http.post(f, f.cookies.principal, '/api/results/publish', armBody(f))).status).toBe(409)
    await http.post(f, f.cookies.classTeacher, '/api/results/submit', armBody(f))

    const res = await http.post(f, f.cookies.principal, '/api/results/publish', armBody(f))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'published', published: { by: 'Emeka Nwosu' } })
    expect(await snapshotsOf(f)).toBe(3)

    // A later change to the grading scale doesn't change the published card
    const card = async () => (await (await http.get(f, f.cookies.admin, `/api/students/${f.students.ada.id}/report-card?termId=${f.first.id}`)).json())
    expect((await card()).subjects.find((s: { name: string }) => s.name === 'Mathematics').grade).toBe('A')
    await db.update(gradeBands).set({ grade: 'Z' }).where(and(eq(gradeBands.schoolId, f.school.id), eq(gradeBands.grade, 'A')))
    expect((await card()).subjects.find((s: { name: string }) => s.name === 'Mathematics').grade).toBe('A')
  })

  it('returns submitted results to draft with a reason, unlocking the scores', async () => {
    const f = await resultsFixture(db, app)
    await http.post(f, f.cookies.classTeacher, '/api/results/submit', armBody(f))

    expect((await http.post(f, f.cookies.principal, '/api/results/return', armBody(f))).status).toBe(400)
    const res = await http.post(f, f.cookies.principal, '/api/results/return', { ...armBody(f), reason: 'Recheck Maths CA2' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'draft', returnedReason: 'Recheck Maths CA2' })
    expect(await lockOf(f)).toBe(0)
    expect((await subjectTeacherSave(f, 5)).status).toBe(200)
    expect((await http.post(f, f.cookies.principal, '/api/results/return', { ...armBody(f), reason: 'Again' })).status).toBe(409)
  })

  it('unpublishes back to submitted, deleting the snapshots but keeping the lock', async () => {
    const f = await resultsFixture(db, app)
    await http.post(f, f.cookies.classTeacher, '/api/results/submit', armBody(f))
    await http.post(f, f.cookies.admin, '/api/results/publish', armBody(f))

    const res = await http.post(f, f.cookies.admin, '/api/results/unpublish', armBody(f))
    expect(res.status).toBe(200)
    expect(await statusOf(f)).toBe('submitted')
    expect(await snapshotsOf(f)).toBe(0)
    expect(await lockOf(f)).toBe(1)
    expect((await http.post(f, f.cookies.admin, '/api/results/unpublish', armBody(f))).status).toBe(409)
  })

  it('keeps submitted or published results locked against a manual unlock', async () => {
    const f = await resultsFixture(db, app)
    await http.post(f, f.cookies.classTeacher, '/api/results/submit', armBody(f))
    const res = await http.del(f, f.cookies.admin, '/api/scores/locks', armBody(f))
    expect(res.status).toBe(409)
    expect((await res.json()).message).toBe('These results are submitted or published. Return them to draft first.')
    expect(await lockOf(f)).toBe(1)
  })
})

describe('principal\'s comments', () => {
  it('saves and clears comments, refuses other arms\' students and published results', async () => {
    const f = await resultsFixture(db, app)
    const save = (comments: { studentId: string, comment: string | null }[]) => http.put(f, f.cookies.principal, '/api/results/principal-comments', { ...armBody(f), comments })

    const res = await save([{ studentId: f.students.ada.id, comment: '  Excellent work  ' }])
    expect(res.status).toBe(200)
    expect((await res.json()).students.find((s: { name: string }) => s.name === 'Ada Obi').principalComment).toBe('Excellent work')
    const cleared = await (await save([{ studentId: f.students.ada.id, comment: '' }])).json()
    expect(cleared.students.find((s: { name: string }) => s.name === 'Ada Obi').principalComment).toBeNull()

    expect((await save([{ studentId: f.students.dayo.id, comment: 'x' }])).status).toBe(400)

    await http.post(f, f.cookies.classTeacher, '/api/results/submit', armBody(f))
    await http.post(f, f.cookies.principal, '/api/results/publish', armBody(f))
    expect((await save([{ studentId: f.students.ada.id, comment: 'Late change' }])).status).toBe(409)
  })
})

describe('tenant isolation', () => {
  let a: ResultsFixture
  let b: ResultsFixture
  beforeAll(async () => {
    a = await resultsFixture(db, app)
    b = await resultsFixture(db, app)
  })

  it('treats another school\'s arm, term and student as not found, changing nothing', async () => {
    expect((await http.get(b, b.cookies.admin, `/api/results?${armQuery(a)}`)).status).toBe(404)
    expect((await http.get(b, b.cookies.admin, `/api/results?termId=${a.first.id}&classArmId=${b.armA.id}`)).status).toBe(404)
    expect((await http.post(b, b.cookies.admin, '/api/results/submit', armBody(a))).status).toBe(404)
    expect(await statusOf(a)).toBe('draft')
    expect((await http.get(b, b.cookies.admin, `/api/students/${a.students.ada.id}/report-card`)).status).toBe(404)
    expect((await http.get(b, b.cookies.admin, `/api/results/broadsheet?${armQuery(a)}`)).status).toBe(404)
  })

  it('rejects a School A session on School B\'s host and ignores a schoolId in the body', async () => {
    expect((await http.get(b, a.cookies.admin, `/api/results?${armQuery(b)}`)).status).toBe(401)
    const res = await app.request('/api/results/submit', {
      host: hostOf(a.school.slug), cookie: a.cookies.classTeacher, method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...armBody(a), schoolId: b.school.id }),
    })
    expect(res.status).toBe(200)
    expect(await statusOf(a)).toBe('submitted')
    expect(await statusOf(b)).toBe('draft')
  })
})

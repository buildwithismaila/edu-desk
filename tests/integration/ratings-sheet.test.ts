import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { termComments, traitRatings } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { assignClassTeacher, assignSubjectTeacher, createClassArm, createClassLevel, createSession, createSubject } from '../factories/academics'
import { createSchool } from '../factories/schools'
import { lockScores } from '../factories/scores'
import { createStudent, enrol } from '../factories/students'
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

type Role = 'admin' | 'principal' | 'classTeacher' | 'subjectTeacher' | 'bursar' | 'parent'

/** JSS 1A (Ada, Bola) with a class teacher and a subject teacher; JSS 1B (Chidi); current first term. */
async function setup() {
  const school = await createSchool(db)
  const { session, terms } = await createSession(db, school, { currentTerm: 'first' })
  const first = terms.find(t => t.number === 'first')!
  const second = terms.find(t => t.number === 'second')!
  const level = await createClassLevel(db, school, { section: 'jss', name: 'JSS 1' })
  const armA = await createClassArm(db, school, level, 'A')
  const armB = await createClassArm(db, school, level, 'B')
  const ada = await createStudent(db, school, { firstName: 'Ada', lastName: 'Obi' })
  const bola = await createStudent(db, school, { firstName: 'Bola', lastName: 'Ade' })
  const chidi = await createStudent(db, school, { firstName: 'Chidi', lastName: 'Eze' })
  await enrol(db, school, { student: ada, session, arm: armA })
  await enrol(db, school, { student: bola, session, arm: armA })
  await enrol(db, school, { student: chidi, session, arm: armB })

  const users = {
    admin: await createUser(db, school, { role: 'admin' }),
    principal: await createUser(db, school, { role: 'principal' }),
    classTeacher: await createUser(db, school, { role: 'teacher' }),
    subjectTeacher: await createUser(db, school, { role: 'teacher' }),
    bursar: await createUser(db, school, { role: 'bursar' }),
    parent: await createUser(db, school, { role: 'parent' }),
  }
  await assignClassTeacher(db, school, { session, arm: armA, user: users.classTeacher })
  await assignSubjectTeacher(db, school, { session, arm: armA, user: users.subjectTeacher, subject: await createSubject(db, school) })
  const cookies = {} as Record<Role, string>
  for (const [role, user] of Object.entries(users)) cookies[role as Role] = await app.login(hostOf(school.slug), user.email!, DEFAULT_TEST_PASSWORD)
  return { school, session, first, second, armA, armB, ada, bola, chidi, users, cookies }
}
type Fixture = Awaited<ReturnType<typeof setup>>

const getSheet = (f: Fixture, cookie: string | undefined, query: string) =>
  app.request(`/api/ratings/sheet?${query}`, { host: hostOf(f.school.slug), cookie })
const save = (f: Fixture, cookie: string | undefined, body: Record<string, unknown>) => app.request('/api/ratings/sheet', {
  host: hostOf(f.school.slug), cookie, method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})
const sheetOf = (f: Fixture, term = f.first) => ({ termId: term.id, classArmId: f.armA.id })
const ratingsOf = (student: { id: string }) => db.select().from(traitRatings).where(eq(traitRatings.studentId, student.id))
const commentOf = async (student: { id: string }) => (await db.select().from(termComments).where(eq(termComments.studentId, student.id)))[0]

describe('permissions', () => {
  let f: Fixture
  beforeAll(async () => {
    f = await setup()
  })
  const ROLES: Role[] = ['admin', 'principal', 'classTeacher', 'subjectTeacher', 'bursar', 'parent']
  const allowed = ['admin', 'principal', 'classTeacher']

  it.each(ROLES.map(role => [role, allowed.includes(role) ? 200 : 403] as const))('GET /api/ratings/sheet as %s → %i', async (role, status) => {
    expect((await getSheet(f, f.cookies[role], `classArmId=${f.armA.id}`)).status).toBe(status)
  })

  it.each(ROLES.map(role => [role, allowed.includes(role) ? 200 : 403] as const))('PUT /api/ratings/sheet as %s → %i', async (role, status) => {
    const res = await save(f, f.cookies[role], { ...sheetOf(f), students: [{ studentId: f.ada.id, ratings: { neatness: 1 + ROLES.indexOf(role) % 5 }, comment: role }] })
    expect(res.status).toBe(status)
    if (status === 403) expect((await commentOf(f.ada))?.classTeacherComment).not.toBe(role)
    else expect((await commentOf(f.ada))!.classTeacherComment).toBe(role)
  })

  it('returns 401 without a session', async () => {
    expect((await getSheet(f, undefined, `classArmId=${f.armA.id}`)).status).toBe(401)
    expect((await save(f, undefined, { ...sheetOf(f), students: [{ studentId: f.ada.id, ratings: {}, comment: null }] })).status).toBe(401)
  })
})

describe('GET /api/ratings/sheet', () => {
  it('lists the traits and each student\'s ratings and comment (current term by default)', async () => {
    const f = await setup()
    await save(f, f.cookies.classTeacher, { ...sheetOf(f), students: [{ studentId: f.ada.id, ratings: { punctuality: 4, handwriting: 3 }, comment: 'Good work' }] })

    const body = await (await getSheet(f, f.cookies.classTeacher, `classArmId=${f.armA.id}`)).json()

    expect(body).toMatchObject({ term: { id: f.first.id }, arm: { id: f.armA.id, label: 'JSS 1A' }, locked: false, canEdit: true, readOnlyReason: null })
    expect(body.traits.affective[0]).toEqual({ key: 'punctuality', label: 'Punctuality' })
    expect(body.traits.psychomotor.map((t: { key: string }) => t.key)).toEqual(['handwriting', 'sports', 'drawing_crafts', 'verbal_fluency'])
    expect(body.students.map((s: { name: string }) => s.name)).toEqual(['Bola Ade', 'Ada Obi'])
    expect(body.students[1]).toMatchObject({ id: f.ada.id, ratings: { punctuality: 4, handwriting: 3 }, comment: 'Good work' })
    expect(body.students[0]).toMatchObject({ ratings: {}, comment: null })
  })
})

describe('PUT /api/ratings/sheet', () => {
  it('saves, updates and clears ratings and the comment', async () => {
    const f = await setup()
    await save(f, f.cookies.classTeacher, { ...sheetOf(f), students: [{ studentId: f.ada.id, ratings: { punctuality: 4, honesty: 5 }, comment: 'Good work' }] })
    expect((await ratingsOf(f.ada)).map(r => [r.trait, r.rating]).sort()).toEqual([['honesty', 5], ['punctuality', 4]])
    expect(await commentOf(f.ada)).toMatchObject({ classTeacherComment: 'Good work', enteredById: f.users.classTeacher.id, termId: f.first.id })

    await save(f, f.cookies.classTeacher, { ...sheetOf(f), students: [{ studentId: f.ada.id, ratings: { punctuality: 2, honesty: null }, comment: '' }] })
    expect((await ratingsOf(f.ada)).map(r => [r.trait, r.rating])).toEqual([['punctuality', 2]])
    // The row stays (it also holds the principal's comment); only the class teacher's comment is cleared
    expect(await commentOf(f.ada)).toMatchObject({ classTeacherComment: null })
  })

  it('validates ratings, traits and the students', async () => {
    const f = await setup()
    const one = (student: Record<string, unknown>) => save(f, f.cookies.classTeacher, { ...sheetOf(f), students: [{ studentId: f.ada.id, ratings: {}, comment: null, ...student }] })

    expect((await one({ ratings: { punctuality: 6 } })).status).toBe(400)
    expect((await one({ ratings: { cooking: 3 } })).status).toBe(400)
    const other = await one({ studentId: f.chidi.id, ratings: { punctuality: 3 } })
    expect(other.status).toBe(400)
    expect((await other.json()).data.cellErrors).toEqual([{ studentId: f.chidi.id, message: 'This student isn\'t in this class' }])
    expect(await ratingsOf(f.chidi)).toHaveLength(0)
  })

  it('limits the class teacher to the current term; admin can edit another term of the session', async () => {
    const f = await setup()
    const body = { ...sheetOf(f, f.second), students: [{ studentId: f.ada.id, ratings: { punctuality: 3 }, comment: null }] }
    const teacher = await save(f, f.cookies.classTeacher, body)
    expect(teacher.status).toBe(403)
    expect((await teacher.json()).message).toBe('You can only change ratings for the current term')
    expect((await save(f, f.cookies.admin, body)).status).toBe(200)
  })

  it('refuses changes while the arm is locked', async () => {
    const f = await setup()
    await lockScores(db, f.school, { term: f.first, arm: f.armA })
    const res = await save(f, f.cookies.classTeacher, { ...sheetOf(f), students: [{ studentId: f.ada.id, ratings: { punctuality: 3 }, comment: null }] })
    expect(res.status).toBe(409)
    expect(await (await getSheet(f, f.cookies.classTeacher, `classArmId=${f.armA.id}`)).json()).toMatchObject({ locked: true, canEdit: false, readOnlyReason: 'Locked' })
  })
})

describe('tenant isolation', () => {
  let a: Fixture
  let b: Fixture
  beforeAll(async () => {
    a = await setup()
    b = await setup()
  })

  it('treats another school\'s arm and term as not found, and saves nothing', async () => {
    expect((await getSheet(b, b.cookies.admin, `classArmId=${a.armA.id}`)).status).toBe(404)
    expect((await getSheet(b, b.cookies.admin, `classArmId=${b.armA.id}&termId=${a.first.id}`)).status).toBe(404)
    expect((await save(b, b.cookies.admin, { ...sheetOf(a), students: [{ studentId: a.ada.id, ratings: { punctuality: 3 }, comment: 'x' }] })).status).toBe(404)
    expect(await ratingsOf(a.ada)).toHaveLength(0)
  })

  it('refuses another school\'s student in one\'s own sheet', async () => {
    expect((await save(b, b.cookies.admin, { ...sheetOf(b), students: [{ studentId: a.ada.id, ratings: { punctuality: 3 }, comment: null }] })).status).toBe(400)
  })

  it('rejects a School A session on School B\'s host, and ignores a schoolId in the body', async () => {
    expect((await getSheet(b, a.cookies.admin, `classArmId=${b.armA.id}`)).status).toBe(401)
    expect((await save(a, a.cookies.admin, { ...sheetOf(a), schoolId: b.school.id, students: [{ studentId: a.bola.id, ratings: { sports: 4 }, comment: null }] })).status).toBe(200)
    expect((await ratingsOf(a.bola))[0]!.schoolId).toBe(a.school.id)
  })
})

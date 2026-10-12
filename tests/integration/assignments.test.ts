import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ROLES } from '~~/shared/constants/roles'
import { classTeacherAssignments, subjectTeacherAssignments } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { assignClassTeacher, assignSubjectTeacher, createClassArm, createClassLevel, createSession, createSubject } from '../factories/academics'
import { createSchool, createTwoSchools } from '../factories/schools'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'

let db: Db
let app: ReturnType<typeof createTestApp>
let schoolB: Awaited<ReturnType<typeof createTwoSchools>>['schoolB']

const hostOf = (slug: string) => `${slug}.lvh.me:3000`

beforeAll(async () => {
  db = await createTestDb()
  ;({ schoolB } = await createTwoSchools(db))
})

beforeEach(() => {
  app = createTestApp(db)
})

type SchoolRef = { id: string, slug: string }

async function loginAs(role: typeof ROLES[number], school: SchoolRef) {
  const user = await createUser(db, school, { role })
  return { user, cookie: await app.login(hostOf(school.slug), user.email, DEFAULT_TEST_PASSWORD) }
}

function call(method: string, path: string, cookie: string | undefined, slug: string, body?: unknown) {
  return app.request(path, {
    host: hostOf(slug),
    cookie,
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
}

/** A school with a current session, JSS 1A/1B, SSS 1A, JSS and SSS subjects, teachers and an admin. */
async function freshSchool() {
  const school = await createSchool(db)
  const admin = await loginAs('admin', school)
  const { session } = await createSession(db, school, { currentTerm: 'first' })
  const jss1 = await createClassLevel(db, school, { section: 'jss', name: 'JSS 1' })
  const sss1 = await createClassLevel(db, school, { section: 'sss', name: 'SSS 1' })
  const jss1a = await createClassArm(db, school, jss1, 'A')
  const jss1b = await createClassArm(db, school, jss1, 'B')
  const sss1a = await createClassArm(db, school, sss1, 'A')
  const maths = await createSubject(db, school, { section: 'jss', name: 'Mathematics' })
  const english = await createSubject(db, school, { section: 'jss', name: 'English Language' })
  const physics = await createSubject(db, school, { section: 'sss', name: 'Physics' })
  const teacher = await createUser(db, school, { role: 'teacher', name: 'Tunde Teacher' })
  const teacher2 = await createUser(db, school, { role: 'teacher', name: 'Chioma Teacher' })
  return { school, admin, session, jss1a, jss1b, sss1a, maths, english, physics, teacher, teacher2 }
}

type Arm = { classArmId: string, label: string, section: string, classTeacher: { id: string, name: string, isActive: boolean } | null, subjects: { subjectId: string, name: string, teacher: { id: string } | null }[] }

const armIn = (body: { arms: Arm[] }, id: string) => body.arms.find(a => a.classArmId === id)!

describe('permissions', () => {
  const managers = ['admin', 'principal']

  it.each(ROLES.flatMap(role => [
    ['GET /api/assignments', role, managers.includes(role) ? 200 : 403],
    ['PUT /api/class-arms/:id/class-teacher', role, managers.includes(role) ? 200 : 403],
    ['PUT /api/class-arms/:id/subject-teachers', role, managers.includes(role) ? 200 : 403],
    ['GET /api/me/assignments', role, role === 'bursar' || role === 'parent' ? 403 : 200],
  ] as const))('%s as %s → %i', async (route, role, status) => {
    const f = await freshSchool()
    const { cookie } = await loginAs(role, f.school)
    const [method, path] = route.split(' ') as [string, string]
    const body = path.endsWith('class-teacher')
      ? { userId: f.teacher.id }
      : path.endsWith('subject-teachers') ? { assignments: [{ subjectId: f.maths.id, userId: f.teacher.id }] } : undefined

    expect((await call(method, path.replace(':id', f.jss1a.id), cookie, f.school.slug, body)).status).toBe(status)
  })

  it('returns 401 without a session', async () => {
    const f = await freshSchool()
    expect((await call('GET', '/api/assignments', undefined, f.school.slug)).status).toBe(401)
    expect((await call('GET', '/api/me/assignments', undefined, f.school.slug)).status).toBe(401)
  })
})

describe('GET /api/assignments', () => {
  it('lists every arm with every subject of its section, gaps as null', async () => {
    const f = await freshSchool()
    await assignClassTeacher(db, f.school, { session: f.session, arm: f.jss1a, user: f.teacher })
    await assignSubjectTeacher(db, f.school, { session: f.session, arm: f.jss1a, subject: f.maths, user: f.teacher2 })

    const body = await (await call('GET', '/api/assignments', f.admin.cookie, f.school.slug)).json()

    expect(body.session).toEqual({ id: f.session.id, name: f.session.name })
    expect(body.arms.map((a: Arm) => a.label)).toEqual(['JSS 1A', 'JSS 1B', 'SSS 1A'])
    const jss1a = armIn(body, f.jss1a.id)
    expect(jss1a.classTeacher).toEqual({ id: f.teacher.id, name: 'Tunde Teacher', isActive: true })
    expect(jss1a.subjects.map(s => [s.name, s.teacher?.id ?? null])).toEqual([['English Language', null], ['Mathematics', f.teacher2.id]])
    expect(armIn(body, f.jss1b.id).classTeacher).toBeNull()
    expect(armIn(body, f.sss1a.id).subjects.map(s => s.name)).toEqual(['Physics'])
  })

  it('flags an inactive class teacher', async () => {
    const f = await freshSchool()
    const inactive = await createUser(db, f.school, { role: 'teacher', isActive: false })
    await assignClassTeacher(db, f.school, { session: f.session, arm: f.jss1a, user: inactive })

    const body = await (await call('GET', '/api/assignments', f.admin.cookie, f.school.slug)).json()

    expect(armIn(body, f.jss1a.id).classTeacher).toMatchObject({ id: inactive.id, isActive: false })
  })

  it('uses ?sessionId= and keeps each session\'s assignments apart', async () => {
    const f = await freshSchool()
    const { session: other } = await createSession(db, f.school)
    await assignClassTeacher(db, f.school, { session: other, arm: f.jss1a, user: f.teacher })

    const current = await (await call('GET', '/api/assignments', f.admin.cookie, f.school.slug)).json()
    const chosen = await (await call('GET', `/api/assignments?sessionId=${other.id}`, f.admin.cookie, f.school.slug)).json()

    expect(armIn(current, f.jss1a.id).classTeacher).toBeNull()
    expect(armIn(chosen, f.jss1a.id).classTeacher?.id).toBe(f.teacher.id)
  })

  it('only shows this school\'s arms', async () => {
    const f = await freshSchool()
    const theirLevel = await createClassLevel(db, schoolB, { section: 'jss' })
    const theirArm = await createClassArm(db, schoolB, theirLevel, 'Z')

    const body = await (await call('GET', '/api/assignments', f.admin.cookie, f.school.slug)).json()

    expect(body.arms.map((a: Arm) => a.classArmId)).not.toContain(theirArm.id)
  })

  it('returns 400 when there is no current session, 404 for another school\'s session', async () => {
    const school = await createSchool(db)
    const admin = await loginAs('admin', school)
    const { session: theirs } = await createSession(db, schoolB)

    const none = await call('GET', '/api/assignments', admin.cookie, school.slug)
    expect(none.status).toBe(400)
    expect((await none.json()).data.fieldErrors.sessionId).toEqual(['Set a current term first'])
    expect((await call('GET', `/api/assignments?sessionId=${theirs.id}`, admin.cookie, school.slug)).status).toBe(404)
  })
})

describe('PUT /api/class-arms/:id/class-teacher', () => {
  const put = (f: Awaited<ReturnType<typeof freshSchool>>, armId: string, body: unknown, cookie = f.admin.cookie) =>
    call('PUT', `/api/class-arms/${armId}/class-teacher`, cookie, f.school.slug, body)

  it('sets, replaces and clears the class teacher (one per arm)', async () => {
    const f = await freshSchool()

    expect((await put(f, f.jss1a.id, { userId: f.teacher.id })).status).toBe(200)
    expect((await put(f, f.jss1a.id, { userId: f.teacher2.id })).status).toBe(200)
    let rows = await db.select().from(classTeacherAssignments).where(eq(classTeacherAssignments.classArmId, f.jss1a.id))
    expect(rows.map(r => r.userId)).toEqual([f.teacher2.id])

    expect((await put(f, f.jss1a.id, { userId: null })).status).toBe(200)
    rows = await db.select().from(classTeacherAssignments).where(eq(classTeacherAssignments.classArmId, f.jss1a.id))
    expect(rows).toEqual([])
  })

  it('lets one teacher be class teacher of two arms', async () => {
    const f = await freshSchool()
    await put(f, f.jss1a.id, { userId: f.teacher.id })

    expect((await put(f, f.jss1b.id, { userId: f.teacher.id })).status).toBe(200)
  })

  it('lets a principal assign, and a principal be assigned', async () => {
    const f = await freshSchool()
    const principal = await loginAs('principal', f.school)

    expect((await put(f, f.jss1a.id, { userId: principal.user.id }, principal.cookie)).status).toBe(200)
  })

  it.each([
    ['a bursar', { role: 'bursar' as const }],
    ['a parent', { role: 'parent' as const }],
    ['an inactive teacher', { role: 'teacher' as const, isActive: false }],
    ['a removed teacher', { role: 'teacher' as const, deletedAt: new Date() }],
  ])('refuses %s (400)', async (_case, overrides) => {
    const f = await freshSchool()
    const user = await createUser(db, f.school, overrides)

    const res = await put(f, f.jss1a.id, { userId: user.id })

    expect(res.status).toBe(400)
    expect(Object.keys((await res.json()).data.fieldErrors)).toEqual(['userId'])
    expect(await db.select().from(classTeacherAssignments).where(eq(classTeacherAssignments.classArmId, f.jss1a.id))).toEqual([])
  })

  it('refuses another school\'s teacher (400) and another school\'s arm (404)', async () => {
    const f = await freshSchool()
    const theirTeacher = await createUser(db, schoolB, { role: 'teacher' })
    const theirArm = await createClassArm(db, schoolB, await createClassLevel(db, schoolB), 'A')

    expect((await put(f, f.jss1a.id, { userId: theirTeacher.id })).status).toBe(400)
    expect((await put(f, theirArm.id, { userId: f.teacher.id })).status).toBe(404)
    expect(await db.select().from(classTeacherAssignments).where(eq(classTeacherAssignments.classArmId, theirArm.id))).toEqual([])
  })

  it('assigns in the given session', async () => {
    const f = await freshSchool()
    const { session: other } = await createSession(db, f.school)

    await put(f, f.jss1a.id, { sessionId: other.id, userId: f.teacher.id })

    const rows = await db.select().from(classTeacherAssignments).where(eq(classTeacherAssignments.classArmId, f.jss1a.id))
    expect(rows.map(r => r.sessionId)).toEqual([other.id])
  })
})

describe('PUT /api/class-arms/:id/subject-teachers', () => {
  const put = (f: Awaited<ReturnType<typeof freshSchool>>, armId: string, body: unknown) =>
    call('PUT', `/api/class-arms/${armId}/subject-teachers`, f.admin.cookie, f.school.slug, body)

  it('sets several subjects at once and returns the arm', async () => {
    const f = await freshSchool()

    const res = await put(f, f.jss1a.id, { assignments: [{ subjectId: f.maths.id, userId: f.teacher.id }, { subjectId: f.english.id, userId: f.teacher2.id }] })

    expect(res.status).toBe(200)
    const arm = await res.json() as Arm
    expect(arm.subjects.map(s => [s.name, s.teacher?.id])).toEqual([['English Language', f.teacher2.id], ['Mathematics', f.teacher.id]])
  })

  it('replaces and clears only the listed subjects', async () => {
    const f = await freshSchool()
    await put(f, f.jss1a.id, { assignments: [{ subjectId: f.maths.id, userId: f.teacher.id }, { subjectId: f.english.id, userId: f.teacher.id }] })

    await put(f, f.jss1a.id, { assignments: [{ subjectId: f.maths.id, userId: null }] })

    const rows = await db.select().from(subjectTeacherAssignments).where(eq(subjectTeacherAssignments.classArmId, f.jss1a.id))
    expect(rows.map(r => r.subjectId)).toEqual([f.english.id])
  })

  it('refuses a subject from another section (400) and changes nothing', async () => {
    const f = await freshSchool()

    const res = await put(f, f.jss1a.id, { assignments: [{ subjectId: f.maths.id, userId: f.teacher.id }, { subjectId: f.physics.id, userId: f.teacher.id }] })

    expect(res.status).toBe(400)
    expect((await res.json()).data.fieldErrors.assignments[0]).toMatch(/Physics/)
    expect(await db.select().from(subjectTeacherAssignments).where(eq(subjectTeacherAssignments.classArmId, f.jss1a.id))).toEqual([])
  })

  it('refuses the same subject twice in one request (400)', async () => {
    const f = await freshSchool()
    expect((await put(f, f.jss1a.id, { assignments: [{ subjectId: f.maths.id, userId: f.teacher.id }, { subjectId: f.maths.id, userId: f.teacher2.id }] })).status).toBe(400)
  })

  it('refuses another school\'s subject or an ineligible teacher (400)', async () => {
    const f = await freshSchool()
    const theirSubject = await createSubject(db, schoolB, { section: 'jss' })
    const bursar = await createUser(db, f.school, { role: 'bursar' })

    expect((await put(f, f.jss1a.id, { assignments: [{ subjectId: theirSubject.id, userId: f.teacher.id }] })).status).toBe(400)
    expect((await put(f, f.jss1a.id, { assignments: [{ subjectId: f.maths.id, userId: bursar.id }] })).status).toBe(400)
  })

  it('returns 404 for another school\'s arm', async () => {
    const f = await freshSchool()
    const theirArm = await createClassArm(db, schoolB, await createClassLevel(db, schoolB), 'A')
    expect((await put(f, theirArm.id, { assignments: [{ subjectId: f.maths.id, userId: f.teacher.id }] })).status).toBe(404)
  })
})

describe('deleting setup data removes its assignments', () => {
  it.each([
    ['the arm', (f: Awaited<ReturnType<typeof freshSchool>>) => `/api/class-arms/${f.jss1a.id}`],
    ['the subject', (f: Awaited<ReturnType<typeof freshSchool>>) => `/api/subjects/${f.maths.id}`],
  ])('DELETE %s', async (_case, path) => {
    const f = await freshSchool()
    await assignSubjectTeacher(db, f.school, { session: f.session, arm: f.jss1a, subject: f.maths, user: f.teacher })

    expect((await call('DELETE', path(f), f.admin.cookie, f.school.slug)).status).toBe(200)

    expect(await db.select().from(subjectTeacherAssignments).where(eq(subjectTeacherAssignments.userId, f.teacher.id))).toEqual([])
  })

  it('DELETE a (non-current) session', async () => {
    const f = await freshSchool()
    const { session: old } = await createSession(db, f.school)
    await assignClassTeacher(db, f.school, { session: old, arm: f.jss1a, user: f.teacher })

    expect((await call('DELETE', `/api/sessions/${old.id}`, f.admin.cookie, f.school.slug)).status).toBe(200)

    expect(await db.select().from(classTeacherAssignments).where(eq(classTeacherAssignments.sessionId, old.id))).toEqual([])
  })
})

describe('GET /api/me/assignments', () => {
  it('shows a teacher only their own classes for the current session', async () => {
    const f = await freshSchool()
    await assignClassTeacher(db, f.school, { session: f.session, arm: f.jss1a, user: f.teacher })
    await assignSubjectTeacher(db, f.school, { session: f.session, arm: f.jss1b, subject: f.maths, user: f.teacher })
    await assignSubjectTeacher(db, f.school, { session: f.session, arm: f.jss1a, subject: f.english, user: f.teacher2 })
    const cookie = await app.login(hostOf(f.school.slug), f.teacher.email, DEFAULT_TEST_PASSWORD)

    const body = await (await call('GET', '/api/me/assignments', cookie, f.school.slug)).json()

    expect(body).toEqual({
      session: { id: f.session.id, name: f.session.name },
      classTeacherOf: [{ classArmId: f.jss1a.id, label: 'JSS 1A' }],
      subjects: [{ subjectId: f.maths.id, name: 'Mathematics', classArmId: f.jss1b.id, label: 'JSS 1B' }],
    })
  })

  it('is empty when there is no current session', async () => {
    const school = await createSchool(db)
    const { cookie } = await loginAs('teacher', school)

    expect(await (await call('GET', '/api/me/assignments', cookie, school.slug)).json()).toEqual({ session: null, classTeacherOf: [], subjects: [] })
  })
})

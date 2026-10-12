import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ROLES } from '~~/shared/constants/roles'
import { classTeacherAssignments, subjectTeacherAssignments, users } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { assignClassTeacher, assignSubjectTeacher, createClassArm, createClassLevel, createSession, createSubject } from '../factories/academics'
import { createSchool, createTwoSchools } from '../factories/schools'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { deactivateStaff, removeStaff, updateStaff } from '~~/server/services/staff'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'

let db: Db
let app: ReturnType<typeof createTestApp>
let schoolA: Awaited<ReturnType<typeof createTwoSchools>>['schoolA']
let schoolB: Awaited<ReturnType<typeof createTwoSchools>>['schoolB']

const hostOf = (slug: string) => `${slug}.lvh.me:3000`

let n = 0
const email = () => `staff${++n}@route.test`

beforeAll(async () => {
  db = await createTestDb()
  ;({ schoolA, schoolB } = await createTwoSchools(db))
})

beforeEach(() => {
  app = createTestApp(db)
})

type SchoolRef = { id: string, slug: string }

async function loginAs(role: typeof ROLES[number], school: SchoolRef = schoolA) {
  const user = await createUser(db, school, { role })
  return { user, cookie: await app.login(hostOf(school.slug), user.email, DEFAULT_TEST_PASSWORD) }
}

function call(method: string, path: string, cookie: string | undefined, body?: unknown, slug = schoolA.slug) {
  return app.request(path, {
    host: hostOf(slug),
    cookie,
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
}

const loginStatus = async (school: SchoolRef, userEmail: string, password = DEFAULT_TEST_PASSWORD) =>
  (await app.postJson('/api/auth/login', { email: userEmail, password }, { host: hostOf(school.slug) })).status

/** A school with a fresh admin and a session + arm + subject for assignment fixtures. */
async function freshSchool() {
  const school = await createSchool(db)
  const admin = await loginAs('admin', school)
  const { session } = await createSession(db, school, { currentTerm: 'first' })
  const level = await createClassLevel(db, school, { section: 'jss', name: 'JSS 1' })
  const arm = await createClassArm(db, school, level, 'A')
  const subject = await createSubject(db, school, { section: 'jss', name: 'Mathematics' })
  return { school, admin, session, arm, subject }
}

describe('permissions', () => {
  const readers = ['admin', 'principal']

  it.each(ROLES.flatMap(role => [
    ['GET /api/staff', role, readers.includes(role) ? 200 : 403],
    ['GET /api/staff/:id', role, readers.includes(role) ? 200 : 403],
    ['POST /api/staff', role, role === 'admin' ? 201 : 403],
    ['PATCH /api/staff/:id', role, role === 'admin' ? 200 : 403],
    ['POST /api/staff/:id/deactivate', role, role === 'admin' ? 200 : 403],
    ['POST /api/staff/:id/reactivate', role, role === 'admin' ? 200 : 403],
    ['DELETE /api/staff/:id', role, role === 'admin' ? 200 : 403],
  ] as const))('%s as %s → %i', async (route, role, status) => {
    const target = await createUser(db, schoolA, { role: 'teacher' })
    const { cookie } = await loginAs(role)
    const [method, path] = route.split(' ') as [string, string]
    const body = method === 'POST' && path === '/api/staff'
      ? { name: 'New Teacher', email: email(), role: 'teacher' }
      : method === 'PATCH' ? { name: 'Renamed Teacher' } : undefined

    expect((await call(method, path.replace(':id', target.id), cookie, body)).status).toBe(status)
  })

  it('returns 401 without a session', async () => {
    expect((await call('GET', '/api/staff', undefined)).status).toBe(401)
    expect((await call('POST', '/api/staff', undefined, { name: 'X Y', email: email(), role: 'teacher' })).status).toBe(401)
  })
})

describe('create', () => {
  it('creates a staff member with a temporary password that logs in and forces a change', async () => {
    const { admin, school } = await freshSchool()
    const address = email()

    const res = await call('POST', '/api/staff', admin.cookie, { name: 'Chioma Obi', email: ` ${address.toUpperCase()} `, phone: '0802 111 2233', role: 'teacher' }, school.slug)

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.staff).toMatchObject({ name: 'Chioma Obi', email: address, phone: '+2348021112233', role: 'teacher', isActive: true, mustChangePassword: true })
    expect(body.temporaryPassword).toHaveLength(10)

    const login = await app.postJson('/api/auth/login', { email: address, password: body.temporaryPassword }, { host: hostOf(school.slug) })
    expect(login.status).toBe(200)
    expect((await login.json()).user.mustChangePassword).toBe(true)
  })

  it.each([
    ['a staff member', { role: 'teacher' as const }],
    ['a parent', { role: 'parent' as const }],
    ['a removed account', { role: 'teacher' as const, deletedAt: new Date() }],
  ])('rejects an email already used by %s (409)', async (_case, overrides) => {
    const { admin, school } = await freshSchool()
    const existing = await createUser(db, school, overrides)

    const res = await call('POST', '/api/staff', admin.cookie, { name: 'Someone New', email: existing.email.toUpperCase(), role: 'bursar' }, school.slug)

    expect(res.status).toBe(409)
    expect((await res.json()).message).toBe('This email is already used by another account')
  })

  it('allows an email used at another school', async () => {
    const { admin, school } = await freshSchool()
    const elsewhere = await createUser(db, schoolB)

    expect((await call('POST', '/api/staff', admin.cookie, { name: 'Shared Email', email: elsewhere.email, role: 'teacher' }, school.slug)).status).toBe(201)
  })

  it('returns 400 for a parent role and other invalid fields', async () => {
    const { admin, school } = await freshSchool()

    const res = await call('POST', '/api/staff', admin.cookie, { name: 'A', email: 'nope', role: 'parent', phone: '123' }, school.slug)

    expect(res.status).toBe(400)
    expect(Object.keys((await res.json()).data.fieldErrors).sort()).toEqual(['email', 'name', 'phone', 'role'])
  })
})

describe('list and detail', () => {
  it('lists only this school\'s staff: no parents, no removed accounts, sorted by name', async () => {
    const { admin, school } = await freshSchool()
    await createUser(db, school, { name: 'Zainab Teacher', role: 'teacher' })
    await createUser(db, school, { name: 'Bola Bursar', role: 'bursar' })
    await createUser(db, school, { name: 'Peter Parent', role: 'parent' })
    await createUser(db, school, { name: 'Rita Removed', role: 'teacher', deletedAt: new Date() })
    await createUser(db, schoolB, { name: 'Other School' })

    const body = await (await call('GET', '/api/staff', admin.cookie, undefined, school.slug)).json() as { name: string }[]
    const names = body.map(s => s.name)

    expect(names).toContain('Zainab Teacher')
    expect(names).toContain('Bola Bursar')
    expect(names).not.toContain('Peter Parent')
    expect(names).not.toContain('Rita Removed')
    expect(names).not.toContain('Other School')
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    expect(Object.keys(body[0]!).sort()).toEqual(['email', 'id', 'isActive', 'lastLoginAt', 'mustChangePassword', 'name', 'phone', 'role'])
  })

  it('filters by status', async () => {
    const { admin, school } = await freshSchool()
    const inactive = await createUser(db, school, { isActive: false })

    const active = await (await call('GET', '/api/staff?status=active', admin.cookie, undefined, school.slug)).json() as { id: string }[]
    const inactiveList = await (await call('GET', '/api/staff?status=inactive', admin.cookie, undefined, school.slug)).json() as { id: string }[]

    expect(active.map(s => s.id)).not.toContain(inactive.id)
    expect(inactiveList.map(s => s.id)).toEqual([inactive.id])
    expect((await call('GET', '/api/staff?status=gone', admin.cookie, undefined, school.slug)).status).toBe(400)
  })

  it('shows a staff member with their assignments for the current session', async () => {
    const { admin, school, session, arm, subject } = await freshSchool()
    const teacher = await createUser(db, school, { role: 'teacher' })
    await assignClassTeacher(db, school, { session, arm, user: teacher })
    await assignSubjectTeacher(db, school, { session, arm, subject, user: teacher })

    const body = await (await call('GET', `/api/staff/${teacher.id}`, admin.cookie, undefined, school.slug)).json()

    expect(body).toMatchObject({
      id: teacher.id,
      session: { id: session.id, name: session.name },
      classTeacherOf: [{ classArmId: arm.id, label: 'JSS 1A' }],
      subjects: [{ subjectId: subject.id, name: 'Mathematics', classArmId: arm.id, label: 'JSS 1A' }],
    })
  })

  it.each([
    ['a parent', { role: 'parent' as const }],
    ['a removed account', { role: 'teacher' as const, deletedAt: new Date() }],
  ])('returns 404 for %s', async (_case, overrides) => {
    const { admin, school } = await freshSchool()
    const user = await createUser(db, school, overrides)
    expect((await call('GET', `/api/staff/${user.id}`, admin.cookie, undefined, school.slug)).status).toBe(404)
  })
})

describe('update', () => {
  it('updates name, email, phone and role', async () => {
    const { admin, school } = await freshSchool()
    const teacher = await createUser(db, school, { role: 'teacher' })
    const address = email()

    const res = await call('PATCH', `/api/staff/${teacher.id}`, admin.cookie, { name: 'New Name', email: address, phone: '08031234567', role: 'principal' }, school.slug)

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ name: 'New Name', email: address, phone: '+2348031234567', role: 'principal' })
    expect(await loginStatus(school, address)).toBe(200)
  })

  it('clears the phone', async () => {
    const { admin, school } = await freshSchool()
    const teacher = await createUser(db, school, { phone: '+2348031234567' })
    expect(await (await call('PATCH', `/api/staff/${teacher.id}`, admin.cookie, { phone: '' }, school.slug)).json()).toMatchObject({ phone: null })
  })

  it('rejects an email used by another account (409)', async () => {
    const { admin, school } = await freshSchool()
    const teacher = await createUser(db, school)
    const parent = await createUser(db, school, { role: 'parent' })

    expect((await call('PATCH', `/api/staff/${teacher.id}`, admin.cookie, { email: parent.email }, school.slug)).status).toBe(409)
  })

  it('drops assignments when the role becomes bursar, keeps them for principal', async () => {
    const { admin, school, session, arm, subject } = await freshSchool()
    const toBursar = await createUser(db, school)
    const toPrincipal = await createUser(db, school)
    await assignClassTeacher(db, school, { session, arm, user: toBursar })
    const armB = await createClassArm(db, school, { id: arm.classLevelId }, 'B')
    await assignSubjectTeacher(db, school, { session, arm: armB, subject, user: toPrincipal })

    await call('PATCH', `/api/staff/${toBursar.id}`, admin.cookie, { role: 'bursar' }, school.slug)
    await call('PATCH', `/api/staff/${toPrincipal.id}`, admin.cookie, { role: 'principal' }, school.slug)

    expect(await db.select().from(classTeacherAssignments).where(eq(classTeacherAssignments.userId, toBursar.id))).toEqual([])
    expect(await db.select().from(subjectTeacherAssignments).where(eq(subjectTeacherAssignments.userId, toPrincipal.id))).toHaveLength(1)
  })
})

describe('guards', () => {
  it.each([
    ['deactivate themselves', 'POST', '/deactivate', undefined],
    ['remove themselves', 'DELETE', '', undefined],
    ['change their own role', 'PATCH', '', { role: 'teacher' }],
  ])('an admin cannot %s (409)', async (_case, method, suffix, body) => {
    const { admin, school } = await freshSchool()
    await createUser(db, school, { role: 'admin' }) // another admin exists, so only the self rule applies

    const res = await call(method, `/api/staff/${admin.user.id}${suffix}`, admin.cookie, body, school.slug)

    expect(res.status).toBe(409)
    const [row] = await db.select().from(users).where(eq(users.id, admin.user.id))
    expect(row).toMatchObject({ isActive: true, role: 'admin', deletedAt: null })
  })

  it('lets an admin edit their own name', async () => {
    const { admin, school } = await freshSchool()
    expect((await call('PATCH', `/api/staff/${admin.user.id}`, admin.cookie, { name: 'Still Admin' }, school.slug)).status).toBe(200)
  })

  it('allows deactivating, demoting or removing another admin (the acting admin remains)', async () => {
    const { admin, school } = await freshSchool()
    const [a, b, c] = [await createUser(db, school, { role: 'admin' }), await createUser(db, school, { role: 'admin' }), await createUser(db, school, { role: 'admin' })]

    expect((await call('POST', `/api/staff/${a.id}/deactivate`, admin.cookie, undefined, school.slug)).status).toBe(200)
    expect((await call('PATCH', `/api/staff/${b.id}`, admin.cookie, { role: 'teacher' }, school.slug)).status).toBe(200)
    expect((await call('DELETE', `/api/staff/${c.id}`, admin.cookie, undefined, school.slug)).status).toBe(200)
  })

  // Through the API the actor is always an active admin, so acting on another admin always leaves one.
  // The guard matters when two admins change each other at the same time; it runs in a transaction that
  // locks the school's admin rows. Tests reach it by calling the service with an actor who isn't the target.
  it.each([
    ['deactivating', (actor: string, target: string, school: { id: string }) => deactivateStaff(db, school, actor, target)],
    ['removing', (actor: string, target: string, school: { id: string }) => removeStaff(db, school, actor, target)],
    ['demoting', (actor: string, target: string, school: { id: string }) => updateStaff(db, school, actor, target, { role: 'teacher' })],
  ])('refuses %s the last active admin (409) and changes nothing', async (_case, act) => {
    const school = await createSchool(db)
    const onlyAdmin = await createUser(db, school, { role: 'admin' })
    const principal = await createUser(db, school, { role: 'principal' })

    await expect(act(principal.id, onlyAdmin.id, school)).rejects.toMatchObject({ statusCode: 409, message: 'The school must keep at least one active admin' })

    const [row] = await db.select().from(users).where(eq(users.id, onlyAdmin.id))
    expect(row).toMatchObject({ isActive: true, role: 'admin', deletedAt: null })
  })
})

describe('deactivate and reactivate', () => {
  it('stops login and the existing session; reactivating restores login', async () => {
    const { admin, school } = await freshSchool()
    const teacher = await createUser(db, school)
    const teacherCookie = await app.login(hostOf(school.slug), teacher.email, DEFAULT_TEST_PASSWORD)

    const res = await call('POST', `/api/staff/${teacher.id}/deactivate`, admin.cookie, undefined, school.slug)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ isActive: false })

    expect(await loginStatus(school, teacher.email)).toBe(403)
    expect((await app.request('/__test/require-user', { host: hostOf(school.slug), cookie: teacherCookie })).status).toBe(401)

    expect((await call('POST', `/api/staff/${teacher.id}/reactivate`, admin.cookie, undefined, school.slug)).status).toBe(200)
    expect(await loginStatus(school, teacher.email)).toBe(200)
  })

  it('is idempotent', async () => {
    const { admin, school } = await freshSchool()
    const teacher = await createUser(db, school)
    await call('POST', `/api/staff/${teacher.id}/deactivate`, admin.cookie, undefined, school.slug)

    expect((await call('POST', `/api/staff/${teacher.id}/deactivate`, admin.cookie, undefined, school.slug)).status).toBe(200)
  })

  it('keeps assignments when deactivating', async () => {
    const { admin, school, session, arm } = await freshSchool()
    const teacher = await createUser(db, school)
    await assignClassTeacher(db, school, { session, arm, user: teacher })

    await call('POST', `/api/staff/${teacher.id}/deactivate`, admin.cookie, undefined, school.slug)

    expect(await db.select().from(classTeacherAssignments).where(eq(classTeacherAssignments.userId, teacher.id))).toHaveLength(1)
  })
})

describe('remove', () => {
  it('soft-deletes: no login, no session, hidden, assignments cleared, reset-password 404', async () => {
    const { admin, school, session, arm, subject } = await freshSchool()
    const teacher = await createUser(db, school)
    const teacherCookie = await app.login(hostOf(school.slug), teacher.email, DEFAULT_TEST_PASSWORD)
    await assignClassTeacher(db, school, { session, arm, user: teacher })
    await assignSubjectTeacher(db, school, { session, arm, subject, user: teacher })

    expect((await call('DELETE', `/api/staff/${teacher.id}`, admin.cookie, undefined, school.slug)).status).toBe(200)

    const [row] = await db.select().from(users).where(eq(users.id, teacher.id))
    expect(row!.deletedAt).toBeInstanceOf(Date)
    expect(row!.isActive).toBe(false)
    expect(await loginStatus(school, teacher.email)).toBe(401)
    expect((await app.request('/__test/require-user', { host: hostOf(school.slug), cookie: teacherCookie })).status).toBe(401)
    const list = await (await call('GET', '/api/staff', admin.cookie, undefined, school.slug)).json() as { id: string }[]
    expect(list.map(s => s.id)).not.toContain(teacher.id)
    expect(await db.select().from(classTeacherAssignments).where(eq(classTeacherAssignments.userId, teacher.id))).toEqual([])
    expect(await db.select().from(subjectTeacherAssignments).where(eq(subjectTeacherAssignments.userId, teacher.id))).toEqual([])
    expect((await call('POST', `/api/users/${teacher.id}/reset-password`, admin.cookie, undefined, school.slug)).status).toBe(404)
  })

  it('returns 404 for an already removed account', async () => {
    const { admin, school } = await freshSchool()
    const removed = await createUser(db, school, { deletedAt: new Date() })
    expect((await call('DELETE', `/api/staff/${removed.id}`, admin.cookie, undefined, school.slug)).status).toBe(404)
  })
})

describe('cross-tenant', () => {
  it.each([
    ['GET', '', undefined],
    ['PATCH', '', { name: 'Hijacked' }],
    ['POST', '/deactivate', undefined],
    ['POST', '/reactivate', undefined],
    ['DELETE', '', undefined],
  ])('%s /api/staff/:id%s with another school\'s staff → 404, nothing changed', async (method, suffix, body) => {
    const { admin, school } = await freshSchool()
    const theirs = await createUser(db, schoolB, { role: 'teacher' })

    const res = await call(method, `/api/staff/${theirs.id}${suffix}`, admin.cookie, body, school.slug)

    expect(res.status).toBe(404)
    const [row] = await db.select().from(users).where(eq(users.id, theirs.id))
    expect(row).toMatchObject({ name: theirs.name, isActive: true, deletedAt: null })
  })

  it('creates staff in the host school even if the body names another', async () => {
    const { admin, school } = await freshSchool()
    const address = email()

    const res = await call('POST', '/api/staff', admin.cookie, { name: 'Host Staff', email: address, role: 'teacher', schoolId: schoolB.id }, school.slug)

    const [row] = await db.select().from(users).where(eq(users.id, (await res.json()).staff.id))
    expect(row!.schoolId).toBe(school.id)
  })
})

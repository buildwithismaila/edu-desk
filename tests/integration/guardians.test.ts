import { and, eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ROLES } from '~~/shared/constants/roles'
import { studentGuardians, users } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createClassArm, createClassLevel, createSession } from '../factories/academics'
import { createSchool, createTwoSchools } from '../factories/schools'
import { createGuardian, createStudent, enrol } from '../factories/students'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'

let db: Db
let app: ReturnType<typeof createTestApp>
let schoolB: Awaited<ReturnType<typeof createTwoSchools>>['schoolB']

const hostOf = (slug: string) => `${slug}.lvh.me:3000`
type SchoolRef = { id: string, slug: string }

let n = 0
const phone = () => `+2348055${String(++n).padStart(6, '0')}`

beforeAll(async () => {
  db = await createTestDb()
  ;({ schoolB } = await createTwoSchools(db))
})

beforeEach(() => {
  app = createTestApp(db)
})

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

async function freshSchool() {
  const school = await createSchool(db)
  const admin = await loginAs('admin', school)
  return { school, admin }
}

const linksOf = (studentId: string) => db.select().from(studentGuardians).where(eq(studentGuardians.studentId, studentId))

describe('permissions', () => {
  it.each(ROLES.flatMap(role => [
    ['GET /api/guardians', role, role === 'admin' ? 200 : 403],
    ['PATCH /api/guardians/:guardian', role, role === 'admin' ? 200 : 403],
    ['POST /api/students/:student/guardians', role, role === 'admin' ? 201 : 403],
    ['DELETE /api/students/:student/guardians/:guardian', role, role === 'admin' ? 200 : 403],
    ['GET /api/me/children', role, role === 'parent' ? 200 : 403],
  ] as const))('%s as %s → %i', async (route, role, status) => {
    const { school } = await freshSchool()
    const [g1, g2] = [await createGuardian(db, school), await createGuardian(db, school)]
    const student = await createStudent(db, school, { guardians: [g1, g2] })
    const { cookie } = await loginAs(role, school)
    const [method, template] = route.split(' ') as [string, string]
    const path = template.replace(':guardian', g1.id).replace(':student', student.id)
    const body = method === 'PATCH' ? { name: 'Renamed Guardian' } : method === 'POST' ? { name: 'New Guardian', phone: phone(), relationship: 'mother' } : undefined

    expect((await call(method, path, cookie, school.slug, body)).status).toBe(status)
  })

  it('returns 401 without a session', async () => {
    const { school } = await freshSchool()
    expect((await call('GET', '/api/guardians', undefined, school.slug)).status).toBe(401)
    expect((await call('GET', '/api/me/children', undefined, school.slug)).status).toBe(401)
  })
})

describe('linking guardians', () => {
  it('links an existing guardian so siblings share one account', async () => {
    const { school, admin } = await freshSchool()
    const mother = await createGuardian(db, school, { name: 'Ngozi Eze' })
    await createStudent(db, school, { guardians: [mother] })
    const sibling = await createStudent(db, school, { guardians: [await createGuardian(db, school)] })

    const res = await call('POST', `/api/students/${sibling.id}/guardians`, admin.cookie, school.slug, { guardianId: mother.id, relationship: 'mother' })

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ guardian: { id: mother.id, name: 'Ngozi Eze' }, temporaryPassword: null })
    expect((await linksOf(sibling.id)).map(l => l.guardianId)).toContain(mother.id)
    const parents = await db.select().from(users).where(and(eq(users.schoolId, school.id), eq(users.name, 'Ngozi Eze')))
    expect(parents).toHaveLength(1)
  })

  it('creates a new guardian account with a temporary password that logs in by phone', async () => {
    const { school, admin } = await freshSchool()
    const student = await createStudent(db, school, { guardians: [await createGuardian(db, school)] })
    const number = phone()

    const res = await call('POST', `/api/students/${student.id}/guardians`, admin.cookie, school.slug, { name: 'Kunle Adeyemi', phone: number, relationship: 'father' })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.guardian).toMatchObject({ name: 'Kunle Adeyemi', phone: number, email: null })
    const login = await app.postJson('/api/auth/login', { login: number.replace('+234', '0'), password: body.temporaryPassword }, { host: hostOf(school.slug) })
    expect(login.status).toBe(200)
    expect((await login.json()).user).toMatchObject({ role: 'parent', mustChangePassword: true })
  })

  it.each([
    ['a staff member', { role: 'teacher' as const }],
    ['another parent', { role: 'parent' as const }],
  ])('refuses a new guardian whose phone is used by %s (409)', async (_case, overrides) => {
    const { school, admin } = await freshSchool()
    const existing = await createUser(db, school, { ...overrides, phone: phone() })
    const student = await createStudent(db, school, { guardians: [await createGuardian(db, school)] })

    const res = await call('POST', `/api/students/${student.id}/guardians`, admin.cookie, school.slug, { name: 'Someone', phone: existing.phone, relationship: 'other' })

    expect(res.status).toBe(409)
    expect((await res.json()).message).toBe('This phone number is already used by another account')
  })

  it('refuses linking the same guardian twice (409)', async () => {
    const { school, admin } = await freshSchool()
    const mother = await createGuardian(db, school)
    const student = await createStudent(db, school, { guardians: [mother] })

    expect((await call('POST', `/api/students/${student.id}/guardians`, admin.cookie, school.slug, { guardianId: mother.id })).status).toBe(409)
  })

  it.each([
    ['a staff account', async (school: SchoolRef) => createUser(db, school, { role: 'teacher' })],
    ['another school\'s guardian', async () => createGuardian(db, schoolB)],
    ['a removed guardian', async (school: SchoolRef) => {
      const g = await createGuardian(db, school)
      await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, g.id))
      return g
    }],
  ])('refuses to link %s (400)', async (_case, make) => {
    const { school, admin } = await freshSchool()
    const student = await createStudent(db, school, { guardians: [await createGuardian(db, school)] })
    const notAGuardian = await make(school)

    const res = await call('POST', `/api/students/${student.id}/guardians`, admin.cookie, school.slug, { guardianId: notAGuardian.id })

    expect(res.status).toBe(400)
    expect(Object.keys((await res.json()).data.fieldErrors)).toEqual(['guardianId'])
  })

  it('returns 404 for another school\'s or a removed student', async () => {
    const { school, admin } = await freshSchool()
    const theirs = await createStudent(db, schoolB, { guardians: [await createGuardian(db, schoolB)] })
    const removed = await createStudent(db, school, { deletedAt: new Date() })
    const body = { name: 'X Y', phone: phone() }

    expect((await call('POST', `/api/students/${theirs.id}/guardians`, admin.cookie, school.slug, body)).status).toBe(404)
    expect((await call('POST', `/api/students/${removed.id}/guardians`, admin.cookie, school.slug, body)).status).toBe(404)
    expect(await linksOf(theirs.id)).toHaveLength(1)
  })
})

describe('unlinking guardians', () => {
  it('unlinks a guardian but never the last one (409)', async () => {
    const { school, admin } = await freshSchool()
    const [mother, father] = [await createGuardian(db, school), await createGuardian(db, school)]
    const student = await createStudent(db, school, { guardians: [mother, father] })

    expect((await call('DELETE', `/api/students/${student.id}/guardians/${father.id}`, admin.cookie, school.slug)).status).toBe(200)
    const res = await call('DELETE', `/api/students/${student.id}/guardians/${mother.id}`, admin.cookie, school.slug)
    expect(res.status).toBe(409)
    expect((await res.json()).message).toMatch(/at least one guardian/)
    expect((await linksOf(student.id)).map(l => l.guardianId)).toEqual([mother.id])
  })

  it('returns 404 when the guardian isn\'t linked to that student', async () => {
    const { school, admin } = await freshSchool()
    const student = await createStudent(db, school, { guardians: [await createGuardian(db, school), await createGuardian(db, school)] })
    const stranger = await createGuardian(db, school)

    expect((await call('DELETE', `/api/students/${student.id}/guardians/${stranger.id}`, admin.cookie, school.slug)).status).toBe(404)
  })
})

describe('GET /api/guardians', () => {
  it('searches this school\'s guardians by name or phone, with their children', async () => {
    const { school, admin } = await freshSchool()
    const mother = await createGuardian(db, school, { name: 'Ngozi Eze', phone: '+2348031119999' })
    await createStudent(db, school, { firstName: 'Chidera', lastName: 'Eze', guardians: [mother] })
    await createStudent(db, school, { firstName: 'Gone', lastName: 'Eze', guardians: [mother], deletedAt: new Date() })
    await createGuardian(db, schoolB, { name: 'Ngozi Eze' })
    await createUser(db, school, { name: 'Ngozi Staff', role: 'teacher' })

    const byName = await (await call('GET', '/api/guardians?search=ngozi', admin.cookie, school.slug)).json()
    const byPhone = await (await call('GET', '/api/guardians?search=0803 111 9999', admin.cookie, school.slug)).json()

    expect(byName).toEqual([{ id: mother.id, name: 'Ngozi Eze', phone: '+2348031119999', email: mother.email, children: ['Chidera Eze'] }])
    expect(byPhone.map((g: { id: string }) => g.id)).toEqual([mother.id])
  })
})

describe('PATCH /api/guardians/:id', () => {
  it('updates name, phone and email; refuses a phone or email used by another account', async () => {
    const { school, admin } = await freshSchool()
    const guardian = await createGuardian(db, school)
    const other = await createUser(db, school, { phone: phone() })
    const number = phone()

    const res = await call('PATCH', `/api/guardians/${guardian.id}`, admin.cookie, school.slug, { name: 'New Name', phone: number.replace('+234', '0'), email: '' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ name: 'New Name', phone: number, email: null })

    expect((await call('PATCH', `/api/guardians/${guardian.id}`, admin.cookie, school.slug, { phone: other.phone })).status).toBe(409)
    expect((await call('PATCH', `/api/guardians/${guardian.id}`, admin.cookie, school.slug, { email: other.email })).status).toBe(409)
  })

  it('returns 404 for a staff account or another school\'s guardian', async () => {
    const { school, admin } = await freshSchool()
    const teacher = await createUser(db, school, { role: 'teacher' })
    const theirs = await createGuardian(db, schoolB)

    expect((await call('PATCH', `/api/guardians/${teacher.id}`, admin.cookie, school.slug, { name: 'Hijack' })).status).toBe(404)
    expect((await call('PATCH', `/api/guardians/${theirs.id}`, admin.cookie, school.slug, { name: 'Hijack' })).status).toBe(404)
  })
})

describe('GET /api/me/children', () => {
  it('shows a parent only their own, non-removed children with their current class', async () => {
    const { school } = await freshSchool()
    const { session } = await createSession(db, school, { currentTerm: 'first' })
    const arm = await createClassArm(db, school, await createClassLevel(db, school, { name: 'JSS 1' }), 'A')
    const parent = await createGuardian(db, school)
    const mine = await createStudent(db, school, { firstName: 'Chidera', lastName: 'Eze', admissionNumber: 'GFA/2026/0001', guardians: [parent] })
    await enrol(db, school, { student: mine, session, arm })
    await createStudent(db, school, { guardians: [parent], deletedAt: new Date() })
    await createStudent(db, school, { guardians: [await createGuardian(db, school)] })
    const cookie = await app.login(hostOf(school.slug), parent.email!, DEFAULT_TEST_PASSWORD)

    const body = await (await call('GET', '/api/me/children', cookie, school.slug)).json()

    expect(body).toEqual([{ id: mine.id, name: 'Chidera Eze', admissionNumber: 'GFA/2026/0001', classLabel: 'JSS 1A', photoUrl: null, attendanceRate: null, absentDays: 0, balanceKobo: null, latestReportCard: null }])
  })
})

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ROLES } from '~~/shared/constants/roles'
import { studentEnrolments, students } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { assignClassTeacher, createClassArm, createClassLevel, createDepartment, createSession } from '../factories/academics'
import { createSchool, createTwoSchools } from '../factories/schools'
import { createGuardian, createStudent, enrol } from '../factories/students'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'
import { resetTestStorage, testStorageKeys } from '../helpers/nitro-imports'

let db: Db
let app: ReturnType<typeof createTestApp>
let schoolB: Awaited<ReturnType<typeof createTwoSchools>>['schoolB']

const hostOf = (slug: string) => `${slug}.lvh.me:3000`
type SchoolRef = { id: string, slug: string }

const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 9, 9, 9])

beforeAll(async () => {
  db = await createTestDb()
  ;({ schoolB } = await createTwoSchools(db))
})

beforeEach(() => {
  app = createTestApp(db)
  resetTestStorage()
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

function uploadPhoto(studentId: string, cookie: string | undefined, slug: string, bytes = PNG) {
  const form = new FormData()
  form.append('photo', new Blob([bytes as BlobPart]), 'photo.png')
  return app.request(`/api/students/${studentId}/photo`, { host: hostOf(slug), cookie, method: 'PUT', body: form })
}

/** A school with a current session, JSS 1A and SSS 1A, and one JSS 1A student with a guardian. */
async function freshSchool() {
  const school = await createSchool(db)
  const admin = await loginAs('admin', school)
  const { session } = await createSession(db, school, { currentTerm: 'first' })
  const jss1a = await createClassArm(db, school, await createClassLevel(db, school, { section: 'jss', name: 'JSS 1' }), 'A')
  const sss1a = await createClassArm(db, school, await createClassLevel(db, school, { section: 'sss', name: 'SSS 1' }), 'A')
  const guardian = await createGuardian(db, school, { name: 'Ngozi Eze' })
  const student = await createStudent(db, school, {
    firstName: 'Chidera', lastName: 'Eze', dateOfBirth: '2014-02-14', stateOfOrigin: 'Anambra', address: '1 Palm Close', guardians: [guardian],
  })
  await enrol(db, school, { student, session, arm: jss1a })
  return { school, admin, session, jss1a, sss1a, guardian, student }
}

describe('permissions', () => {
  it.each(ROLES.flatMap(role => [
    ['GET /api/students/:id', role, role === 'parent' ? 403 : role === 'teacher' ? 404 : 200],
    ['PATCH /api/students/:id', role, role === 'admin' ? 200 : 403],
    ['PUT /api/students/:id/enrolment', role, role === 'admin' ? 200 : 403],
    ['DELETE /api/students/:id', role, role === 'admin' ? 200 : 403],
    ['PUT /api/students/:id/photo', role, role === 'admin' ? 200 : 403],
  ] as const))('%s as %s → %i', async (route, role, status) => {
    const f = await freshSchool()
    const { cookie } = await loginAs(role, f.school)
    const [method, template] = route.split(' ') as [string, string]
    const path = template.replace(':id', f.student.id)
    if (path.endsWith('/photo')) {
      expect((await uploadPhoto(f.student.id, cookie, f.school.slug)).status).toBe(status)
      return
    }
    const body = method === 'PATCH' ? { lga: 'Onitsha' } : method === 'PUT' ? { classArmId: f.jss1a.id } : undefined
    expect((await call(method, path, cookie, f.school.slug, body)).status).toBe(status)
  })
})

describe('GET /api/students/:id', () => {
  it('shows the full profile to an admin', async () => {
    const f = await freshSchool()

    const body = await (await call('GET', `/api/students/${f.student.id}`, f.admin.cookie, f.school.slug)).json()

    expect(body).toMatchObject({
      id: f.student.id,
      firstName: 'Chidera',
      dateOfBirth: '2014-02-14',
      stateOfOrigin: 'Anambra',
      address: '1 Palm Close',
      enrolment: { sessionId: f.session.id, classArmId: f.jss1a.id, label: 'JSS 1A' },
      guardians: [{ id: f.guardian.id, name: 'Ngozi Eze', phone: f.guardian.phone, relationship: 'guardian', isPrimary: true }],
      photoUrl: null,
    })
  })

  it('hides personal details from the bursar', async () => {
    const f = await freshSchool()
    const { cookie } = await loginAs('bursar', f.school)

    const body = await (await call('GET', `/api/students/${f.student.id}`, cookie, f.school.slug)).json()

    expect(body.firstName).toBe('Chidera')
    expect(body.guardians).toHaveLength(1)
    for (const field of ['dateOfBirth', 'stateOfOrigin', 'lga', 'address']) expect(body).not.toHaveProperty(field)
  })

  it('shows a teacher only students in their arms (404 otherwise)', async () => {
    const f = await freshSchool()
    const teacher = await loginAs('teacher', f.school)
    expect((await call('GET', `/api/students/${f.student.id}`, teacher.cookie, f.school.slug)).status).toBe(404)

    await assignClassTeacher(db, f.school, { session: f.session, arm: f.jss1a, user: teacher.user })
    expect((await call('GET', `/api/students/${f.student.id}`, teacher.cookie, f.school.slug)).status).toBe(200)
  })

  it('returns 404 for another school\'s student and for a removed student', async () => {
    const f = await freshSchool()
    const theirs = await createStudent(db, schoolB)
    const removed = await createStudent(db, f.school, { deletedAt: new Date() })

    expect((await call('GET', `/api/students/${theirs.id}`, f.admin.cookie, f.school.slug)).status).toBe(404)
    expect((await call('GET', `/api/students/${removed.id}`, f.admin.cookie, f.school.slug)).status).toBe(404)
  })
})

describe('PATCH /api/students/:id', () => {
  it('updates details, normalising the state', async () => {
    const f = await freshSchool()

    const res = await call('PATCH', `/api/students/${f.student.id}`, f.admin.cookie, f.school.slug, { middleName: 'Amaka', stateOfOrigin: 'akwa-ibom', address: '' })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ middleName: 'Amaka', stateOfOrigin: 'Akwa Ibom', address: null, firstName: 'Chidera' })
  })

  it('refuses a department for a student who isn\'t in SSS (400), allows it in SSS', async () => {
    const f = await freshSchool()
    const science = await createDepartment(db, f.school, 'Science')

    expect((await call('PATCH', `/api/students/${f.student.id}`, f.admin.cookie, f.school.slug, { departmentId: science.id })).status).toBe(400)
    await call('PUT', `/api/students/${f.student.id}/enrolment`, f.admin.cookie, f.school.slug, { classArmId: f.sss1a.id })
    expect((await call('PATCH', `/api/students/${f.student.id}`, f.admin.cookie, f.school.slug, { departmentId: science.id })).status).toBe(200)
  })

  it('returns 404 for another school\'s student, unchanged', async () => {
    const f = await freshSchool()
    const theirs = await createStudent(db, schoolB, { firstName: 'Theirs' })

    expect((await call('PATCH', `/api/students/${theirs.id}`, f.admin.cookie, f.school.slug, { firstName: 'Hijacked' })).status).toBe(404)
    const [row] = await db.select().from(students).where(eq(students.id, theirs.id))
    expect(row!.firstName).toBe('Theirs')
  })
})

describe('PUT /api/students/:id/enrolment', () => {
  it('moves the student to another arm and clears a department when leaving SSS', async () => {
    const f = await freshSchool()
    const science = await createDepartment(db, f.school, 'Science')
    await call('PUT', `/api/students/${f.student.id}/enrolment`, f.admin.cookie, f.school.slug, { classArmId: f.sss1a.id })
    await call('PATCH', `/api/students/${f.student.id}`, f.admin.cookie, f.school.slug, { departmentId: science.id })

    const res = await call('PUT', `/api/students/${f.student.id}/enrolment`, f.admin.cookie, f.school.slug, { classArmId: f.jss1a.id })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ enrolment: { label: 'JSS 1A' }, department: null })
    expect(await db.select().from(studentEnrolments).where(eq(studentEnrolments.studentId, f.student.id))).toHaveLength(1)
  })

  it('refuses another school\'s arm (400)', async () => {
    const f = await freshSchool()
    const theirArm = await createClassArm(db, schoolB, await createClassLevel(db, schoolB), 'Q')
    expect((await call('PUT', `/api/students/${f.student.id}/enrolment`, f.admin.cookie, f.school.slug, { classArmId: theirArm.id })).status).toBe(400)
  })
})

describe('DELETE /api/students/:id', () => {
  it('soft-deletes: hidden from lists and from the parent, admission number kept', async () => {
    const f = await freshSchool()
    const parentCookie = await app.login(hostOf(f.school.slug), f.guardian.email!, DEFAULT_TEST_PASSWORD)

    expect((await call('DELETE', `/api/students/${f.student.id}`, f.admin.cookie, f.school.slug)).status).toBe(200)

    const [row] = await db.select().from(students).where(eq(students.id, f.student.id))
    expect(row!.deletedAt).toBeInstanceOf(Date)
    expect((await (await call('GET', '/api/students', f.admin.cookie, f.school.slug)).json()).total).toBe(0)
    expect(await (await call('GET', '/api/me/children', parentCookie, f.school.slug)).json()).toEqual([])
  })
})

describe('photos', () => {
  it('uploads a private photo that only allowed users can see', async () => {
    const f = await freshSchool()
    const res = await uploadPhoto(f.student.id, f.admin.cookie, f.school.slug)
    expect(res.status).toBe(200)
    const { photoUrl } = await res.json() as { photoUrl: string }
    expect(testStorageKeys()).toEqual([`uploads:schools:${f.school.id}:students:${f.student.id}.png`])

    const asAdmin = await call('GET', photoUrl, f.admin.cookie, f.school.slug)
    expect(asAdmin.status).toBe(200)
    expect(asAdmin.headers.get('cache-control')).toBe('private, max-age=3600')
    expect(new Uint8Array(await asAdmin.arrayBuffer())).toEqual(PNG)

    const parentCookie = await app.login(hostOf(f.school.slug), f.guardian.email!, DEFAULT_TEST_PASSWORD)
    expect((await call('GET', photoUrl, parentCookie, f.school.slug)).status).toBe(200)

    const strangerParent = await createGuardian(db, f.school)
    const strangerCookie = await app.login(hostOf(f.school.slug), strangerParent.email!, DEFAULT_TEST_PASSWORD)
    expect((await call('GET', photoUrl, strangerCookie, f.school.slug)).status).toBe(404)
    expect((await call('GET', photoUrl, (await loginAs('teacher', f.school)).cookie, f.school.slug)).status).toBe(404)
    expect((await call('GET', photoUrl, undefined, f.school.slug)).status).toBe(401)
  })

  it('rejects a non-image (400) and removes a photo', async () => {
    const f = await freshSchool()
    expect((await uploadPhoto(f.student.id, f.admin.cookie, f.school.slug, new TextEncoder().encode('not an image'))).status).toBe(400)

    await uploadPhoto(f.student.id, f.admin.cookie, f.school.slug)
    expect((await call('DELETE', `/api/students/${f.student.id}/photo`, f.admin.cookie, f.school.slug)).status).toBe(200)
    expect(testStorageKeys()).toEqual([])
  })

  it('never serves another school\'s student photo', async () => {
    const f = await freshSchool()
    const other = await freshSchool()
    await uploadPhoto(other.student.id, other.admin.cookie, other.school.slug)

    expect((await call('GET', `/api/students/${other.student.id}/photo`, f.admin.cookie, f.school.slug)).status).toBe(404)
  })
})

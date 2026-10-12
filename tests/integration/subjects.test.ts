import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ROLES } from '~~/shared/constants/roles'
import { departments, subjects } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createDepartment, createSubject } from '../factories/academics'
import { createSchool, createTwoSchools } from '../factories/schools'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'

let db: Db
let app: ReturnType<typeof createTestApp>
let schoolA: Awaited<ReturnType<typeof createTwoSchools>>['schoolA']
let schoolB: Awaited<ReturnType<typeof createTwoSchools>>['schoolB']
let adminA: string

const hostOf = (slug: string) => `${slug}.lvh.me:3000`

let n = 0
const unique = (prefix: string) => `${prefix} ${++n}`

beforeAll(async () => {
  db = await createTestDb()
  ;({ schoolA, schoolB } = await createTwoSchools(db))
})

beforeEach(async () => {
  app = createTestApp(db)
  adminA = await loginAs('admin')
})

async function loginAs(role: typeof ROLES[number], school: { id: string, slug: string } = schoolA) {
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

describe('permissions', () => {
  type Fixture = { department: string, unusedDepartment: string, subject: string }
  const writes: { route: string, path: (f: Fixture) => string, body?: () => unknown, ok: number }[] = [
    { route: 'POST /api/departments', path: () => '/api/departments', body: () => ({ name: unique('Route dept') }), ok: 201 },
    { route: 'PATCH /api/departments/:id', path: f => `/api/departments/${f.department}`, body: () => ({ name: unique('Route dept') }), ok: 200 },
    { route: 'DELETE /api/departments/:id', path: f => `/api/departments/${f.unusedDepartment}`, ok: 200 },
    { route: 'POST /api/subjects', path: () => '/api/subjects', body: () => ({ section: 'jss', name: unique('Route subject') }), ok: 201 },
    { route: 'PATCH /api/subjects/:id', path: f => `/api/subjects/${f.subject}`, body: () => ({ name: unique('Route subject') }), ok: 200 },
    { route: 'DELETE /api/subjects/:id', path: f => `/api/subjects/${f.subject}`, ok: 200 },
  ]

  it.each(ROLES.flatMap(role => ['/api/departments', '/api/subjects'].map(path => [path, role, role === 'parent' ? 403 : 200] as const)))(
    'GET %s as %s → %i',
    async (path, role, status) => {
      expect((await call('GET', path, await loginAs(role))).status).toBe(status)
    },
  )

  it.each(ROLES.flatMap(role => writes.map(w => [w.route, role, w, role === 'admin' ? w.ok : 403] as const)))(
    '%s as %s',
    async (route, role, write, status) => {
      const department = await createDepartment(db, schoolA)
      const fixture = {
        department: department.id,
        unusedDepartment: (await createDepartment(db, schoolA)).id,
        subject: (await createSubject(db, schoolA, { section: 'sss', departmentId: department.id })).id,
      }

      const res = await call(route.split(' ')[0]!, write.path(fixture), await loginAs(role), write.body?.())
      expect(res.status).toBe(status)
    },
  )

  it('returns 401 without a session', async () => {
    expect((await call('GET', '/api/subjects', undefined)).status).toBe(401)
    expect((await call('POST', '/api/departments', undefined, { name: 'X' })).status).toBe(401)
  })
})

describe('departments', () => {
  it('lists only the school\'s departments, by name', async () => {
    const school = await createSchool(db)
    await createDepartment(db, school, 'Science')
    await createDepartment(db, school, 'Arts')
    await createDepartment(db, schoolB, unique('Other school dept'))

    const body = await (await call('GET', '/api/departments', await loginAs('teacher', school), undefined, school.slug)).json() as { name: string }[]

    expect(body.map(d => d.name)).toEqual(['Arts', 'Science'])
  })

  it('adds, renames and rejects duplicate names ignoring case', async () => {
    const name = unique('Technical')
    const res = await call('POST', '/api/departments', adminA, { name: ` ${name} ` })
    expect(res.status).toBe(201)
    const { id } = await res.json() as { id: string }

    expect((await call('POST', '/api/departments', adminA, { name: name.toLowerCase() })).status).toBe(409)
    expect((await call('PATCH', `/api/departments/${id}`, adminA, { name: unique('Humanities') })).status).toBe(200)
  })

  it('refuses to delete a department that subjects use', async () => {
    const dept = await createDepartment(db, schoolA)
    await createSubject(db, schoolA, { section: 'sss', departmentId: dept.id })

    const res = await call('DELETE', `/api/departments/${dept.id}`, adminA)

    expect(res.status).toBe(409)
    expect((await res.json()).message).toMatch(/subjects/)
  })

  it('returns 404 for another school\'s department, leaving it unchanged', async () => {
    const theirs = await createDepartment(db, schoolB)

    expect((await call('PATCH', `/api/departments/${theirs.id}`, adminA, { name: unique('X') })).status).toBe(404)
    expect((await call('DELETE', `/api/departments/${theirs.id}`, adminA)).status).toBe(404)
    const [row] = await db.select().from(departments).where(eq(departments.id, theirs.id))
    expect(row!.name).toBe(theirs.name)
  })
})

describe('subjects', () => {
  it('lists the school\'s subjects by section then name, with department names, filtered by section', async () => {
    const school = await createSchool(db)
    const admin = await loginAs('admin', school)
    const science = await createDepartment(db, school, 'Science')
    await createSubject(db, school, { section: 'sss', name: 'Physics', departmentId: science.id })
    await createSubject(db, school, { section: 'jss', name: 'Mathematics' })
    await createSubject(db, school, { section: 'jss', name: 'Basic Science' })
    await createSubject(db, schoolB, { section: 'jss', name: unique('Other school subject') })

    const all = await (await call('GET', '/api/subjects', admin, undefined, school.slug)).json() as { name: string, departmentName: string | null }[]
    expect(all.map(s => s.name)).toEqual(['Basic Science', 'Mathematics', 'Physics'])
    expect(all.find(s => s.name === 'Physics')!.departmentName).toBe('Science')

    const sss = await (await call('GET', '/api/subjects?section=sss', admin, undefined, school.slug)).json() as { name: string }[]
    expect(sss.map(s => s.name)).toEqual(['Physics'])
  })

  it('returns 400 for an unknown section filter', async () => {
    expect((await call('GET', '/api/subjects?section=university', adminA)).status).toBe(400)
  })

  it('creates a core subject and a department subject', async () => {
    const dept = await createDepartment(db, schoolA)

    const core = await call('POST', '/api/subjects', adminA, { section: 'sss', name: unique('English'), code: ' eng ' })
    const physics = await call('POST', '/api/subjects', adminA, { section: 'sss', name: unique('Physics'), departmentId: dept.id })

    expect(core.status).toBe(201)
    expect(await core.json()).toMatchObject({ section: 'sss', departmentId: null, code: 'ENG' })
    expect(await physics.json()).toMatchObject({ departmentId: dept.id, departmentName: dept.name })
  })

  it('rejects a duplicate name within a section (ignoring case), allows it in another section', async () => {
    const name = unique('Mathematics')
    await call('POST', '/api/subjects', adminA, { section: 'jss', name })

    expect((await call('POST', '/api/subjects', adminA, { section: 'jss', name: name.toUpperCase() })).status).toBe(409)
    expect((await call('POST', '/api/subjects', adminA, { section: 'primary', name })).status).toBe(201)
  })

  it('rejects a department on a non-SSS subject', async () => {
    const dept = await createDepartment(db, schoolA)

    const res = await call('POST', '/api/subjects', adminA, { section: 'jss', name: unique('Physics'), departmentId: dept.id })

    expect(res.status).toBe(400)
    expect(Object.keys((await res.json()).data.fieldErrors)).toEqual(['departmentId'])
  })

  it('rejects another school\'s department', async () => {
    const theirs = await createDepartment(db, schoolB)

    const res = await call('POST', '/api/subjects', adminA, { section: 'sss', name: unique('Physics'), departmentId: theirs.id })

    expect(res.status).toBe(400)
    expect(Object.keys((await res.json()).data.fieldErrors)).toEqual(['departmentId'])
  })

  it('updates a subject, checking the result as a whole', async () => {
    const dept = await createDepartment(db, schoolA)
    const subject = await createSubject(db, schoolA, { section: 'sss', departmentId: dept.id })
    const path = `/api/subjects/${subject.id}`

    // Moving to JSS while keeping the department is invalid…
    expect((await call('PATCH', path, adminA, { section: 'jss' })).status).toBe(400)
    // …but fine when the department is cleared too
    const res = await call('PATCH', path, adminA, { section: 'jss', departmentId: null })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ section: 'jss', departmentId: null, departmentName: null })
  })

  it('returns 404 for another school\'s subject, leaving it unchanged', async () => {
    const theirs = await createSubject(db, schoolB)

    expect((await call('PATCH', `/api/subjects/${theirs.id}`, adminA, { name: unique('X') })).status).toBe(404)
    expect((await call('DELETE', `/api/subjects/${theirs.id}`, adminA)).status).toBe(404)
    const [row] = await db.select().from(subjects).where(eq(subjects.id, theirs.id))
    expect(row!.name).toBe(theirs.name)
  })

  it('deletes a subject', async () => {
    const subject = await createSubject(db, schoolA)
    expect((await call('DELETE', `/api/subjects/${subject.id}`, adminA)).status).toBe(200)
    expect(await db.select().from(subjects).where(eq(subjects.id, subject.id))).toEqual([])
  })
})

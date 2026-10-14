import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { users } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createClassArm, createClassLevel, createSession } from '../factories/academics'
import { createSchool } from '../factories/schools'
import { createGuardian, createStudent, enrol } from '../factories/students'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'
import { hashPassword } from '../helpers/nitro-imports'

let db: Db
let app: ReturnType<typeof createTestApp>

beforeAll(async () => {
  db = await createTestDb()
  app = createTestApp(db)
})

const hostOf = (slug: string) => `${slug}.lvh.me:3000`
type Role = 'admin' | 'principal' | 'teacher' | 'bursar' | 'parent'

/**
 * JSS 1A: Ada (parent "Imported Parent": no login) and Bola (parent "Slip Parent": temporary password issued);
 * JSS 1B: Chidi (parent "Active Parent": own password). "Removed Parent" is soft-deleted; "No Child Parent"
 * has only a removed child.
 */
async function fixture() {
  const school = await createSchool(db)
  const { session } = await createSession(db, school, { currentTerm: 'first' })
  const level = await createClassLevel(db, school, { name: 'JSS 1' })
  const armA = await createClassArm(db, school, level, 'A')
  const armB = await createClassArm(db, school, level, 'B')

  const imported = await createGuardian(db, school, { name: 'Imported Parent', phone: '+2348031110001' })
  const slip = await createGuardian(db, school, { name: 'Slip Parent', phone: '+2348031110002' })
  const active = await createGuardian(db, school, { name: 'Active Parent', phone: '+2348031110003' })
  const removed = await createGuardian(db, school, { name: 'Removed Parent' })
  const noChild = await createGuardian(db, school, { name: 'No Child Parent' })
  await db.update(users).set({ mustChangePassword: true, temporaryPasswordAt: null }).where(eq(users.id, imported.id))
  await db.update(users).set({ mustChangePassword: true, temporaryPasswordAt: new Date('2026-10-01'), passwordHash: await hashPassword('OldSlip234') }).where(eq(users.id, slip.id))
  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, removed.id))
  await db.update(users).set({ mustChangePassword: true, temporaryPasswordAt: null }).where(eq(users.id, noChild.id))

  const ada = await createStudent(db, school, { firstName: 'Ada', lastName: 'Obi', guardians: [imported] })
  const bola = await createStudent(db, school, { firstName: 'Bola', lastName: 'Ade', guardians: [slip] })
  const chidi = await createStudent(db, school, { firstName: 'Chidi', lastName: 'Eze', guardians: [active] })
  await createStudent(db, school, { firstName: 'Gone', lastName: 'Away', guardians: [noChild], deletedAt: new Date() })
  await enrol(db, school, { student: ada, session, arm: armA })
  await enrol(db, school, { student: bola, session, arm: armA })
  await enrol(db, school, { student: chidi, session, arm: armB })

  const cookies = {} as Record<Role, string>
  for (const role of ['admin', 'principal', 'teacher', 'bursar'] as const) {
    const user = await createUser(db, school, { role })
    cookies[role] = await app.login(hostOf(school.slug), user.email!, DEFAULT_TEST_PASSWORD)
  }
  cookies.parent = await app.login(hostOf(school.slug), active.email!, DEFAULT_TEST_PASSWORD)

  const get = (cookie: string | undefined, path: string) => app.request(path, { host: hostOf(school.slug), cookie })
  const post = (cookie: string | undefined, body: unknown) => app.postJson('/api/parent-logins', body, { host: hostOf(school.slug), cookie })
  const loginAs = (phone: string, password: string) => app.postJson('/api/auth/login', { login: phone, password }, { host: hostOf(school.slug) })
  return { school, armA, armB, parents: { imported, slip, active, removed, noChild }, cookies, get, post, loginAs }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

const statusOf = async (f: Fixture, name: string) => {
  const body = await (await f.get(f.cookies.admin, `/api/parent-logins?search=${encodeURIComponent(name)}`)).json()
  return body.items[0]?.status
}

describe('GET /api/parent-logins', () => {
  let f: Fixture
  beforeAll(async () => {
    f = await fixture()
  })

  it('lists active parents with their children, class and login status', async () => {
    const body = await (await f.get(f.cookies.admin, '/api/parent-logins')).json()
    expect(body.total).toBe(4)
    expect(body.items).toEqual([
      { id: f.parents.active.id, name: 'Active Parent', phone: '+2348031110003', email: f.parents.active.email, status: 'active', lastLoginAt: expect.any(String), children: [{ name: 'Chidi Eze', classLabel: 'JSS 1B' }] },
      { id: f.parents.imported.id, name: 'Imported Parent', phone: '+2348031110001', email: f.parents.imported.email, status: 'none', lastLoginAt: null, children: [{ name: 'Ada Obi', classLabel: 'JSS 1A' }] },
      { id: f.parents.noChild.id, name: 'No Child Parent', phone: f.parents.noChild.phone, email: f.parents.noChild.email, status: 'none', lastLoginAt: null, children: [] },
      { id: f.parents.slip.id, name: 'Slip Parent', phone: '+2348031110002', email: f.parents.slip.email, status: 'issued', lastLoginAt: null, children: [{ name: 'Bola Ade', classLabel: 'JSS 1A' }] },
    ])
  })

  it('filters by class, status and name or phone', async () => {
    const names = async (query: string) => (await (await f.get(f.cookies.admin, `/api/parent-logins?${query}`)).json()).items.map((p: { name: string }) => p.name)
    expect(await names(`classArmId=${f.armA.id}`)).toEqual(['Imported Parent', 'Slip Parent'])
    expect(await names('status=none')).toEqual(['Imported Parent', 'No Child Parent'])
    expect(await names('search=0803%20111%200002')).toEqual(['Slip Parent'])
    expect(await names('search=imported')).toEqual(['Imported Parent'])
  })

  it.each(['principal', 'teacher', 'bursar', 'parent'] as const)('refuses %s (403)', async (role) => {
    expect((await f.get(f.cookies[role], '/api/parent-logins')).status).toBe(403)
  })

  it('needs a login (401) and rejects another school\'s class (404)', async () => {
    const other = await fixture()
    expect((await f.get(undefined, '/api/parent-logins')).status).toBe(401)
    expect((await f.get(f.cookies.admin, `/api/parent-logins?classArmId=${other.armA.id}`)).status).toBe(404)
  })
})

describe('POST /api/parent-logins', () => {
  it('gives every parent without a login a one-time password, shown once, that works and must be changed', async () => {
    const f = await fixture()
    const res = await f.post(f.cookies.admin, { all: true })
    expect(res.status).toBe(200)
    const body = await res.json()

    // Only "No login yet": the slip already sent home and the active parent are left alone
    expect(body.skipped).toBe(0)
    expect(body.slips.map((s: { name: string }) => s.name)).toEqual(['Imported Parent', 'No Child Parent'])
    const slip = body.slips[0]
    expect(slip).toEqual({ guardianId: f.parents.imported.id, name: 'Imported Parent', phone: '+2348031110001', email: f.parents.imported.email, children: [{ name: 'Ada Obi', classLabel: 'JSS 1A' }], temporaryPassword: expect.stringMatching(/^[A-Za-z0-9]{10}$/) })

    const login = await f.loginAs('08031110001', slip.temporaryPassword)
    expect(login.status).toBe(200)
    expect((await login.json()).user.mustChangePassword).toBe(true)
    expect(await statusOf(f, 'Imported Parent')).toBe('issued')
    // The old slip still works: it wasn't regenerated
    expect((await f.loginAs('08031110002', 'OldSlip234')).status).toBe(200)
  })

  it('does one class', async () => {
    const f = await fixture()
    const body = await (await f.post(f.cookies.admin, { classArmId: f.armA.id })).json()
    expect(body.slips.map((s: { name: string }) => s.name)).toEqual(['Imported Parent'])
  })

  it('regenerates chosen parents, replacing their old slip; active ones only when explicitly included', async () => {
    const f = await fixture()
    const body = await (await f.post(f.cookies.admin, { guardianIds: [f.parents.slip.id, f.parents.active.id] })).json()
    expect(body.slips.map((s: { name: string }) => s.name)).toEqual(['Slip Parent'])
    expect(body.skipped).toBe(1)
    expect((await f.loginAs('08031110002', 'OldSlip234')).status).toBe(401)
    expect((await f.loginAs('08031110002', body.slips[0].temporaryPassword)).status).toBe(200)
    // The active parent keeps their own password unless included
    expect((await f.loginAs('08031110003', DEFAULT_TEST_PASSWORD)).status).toBe(200)

    const included = await (await f.post(f.cookies.admin, { guardianIds: [f.parents.active.id], includeActive: true })).json()
    expect(included.slips.map((s: { name: string }) => s.name)).toEqual(['Active Parent'])
    expect((await f.loginAs('08031110003', DEFAULT_TEST_PASSWORD)).status).toBe(401)
    expect(await statusOf(f, 'Active Parent')).toBe('issued')
  })

  it('rejects removed parents, staff and another school\'s parents (400, nothing changed)', async () => {
    const f = await fixture()
    const other = await fixture()
    const staff = await createUser(db, f.school, { role: 'teacher' })
    for (const id of [f.parents.removed.id, staff.id, other.parents.imported.id]) {
      const res = await f.post(f.cookies.admin, { guardianIds: [f.parents.imported.id, id] })
      expect(res.status).toBe(400)
    }
    expect(await statusOf(f, 'Imported Parent')).toBe('none')
    expect(await statusOf(other, 'Imported Parent')).toBe('none')
    expect((await f.post(f.cookies.admin, { classArmId: other.armA.id })).status).toBe(404)
  })

  it('needs exactly one of all, classArmId or guardianIds', async () => {
    const f = await fixture()
    for (const body of [{}, { all: true, classArmId: f.armA.id }, { guardianIds: [] }, { all: false }, { guardianIds: ['nope'] }]) {
      expect([body, (await f.post(f.cookies.admin, body)).status]).toEqual([body, 400])
    }
  })

  it.each(['principal', 'teacher', 'bursar', 'parent'] as const)('refuses %s (403)', async (role) => {
    const f = await fixture()
    expect((await f.post(f.cookies[role], { all: true })).status).toBe(403)
    expect(await statusOf(f, 'Imported Parent')).toBe('none')
  })
})

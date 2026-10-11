import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ROLES } from '~~/shared/constants/roles'
import { users } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createTwoSchools } from '../factories/schools'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'

let db: Db
let app: ReturnType<typeof createTestApp>
let schoolA: Awaited<ReturnType<typeof createTwoSchools>>['schoolA']
let schoolB: Awaited<ReturnType<typeof createTwoSchools>>['schoolB']

const hostOf = (slug: string) => `${slug}.lvh.me:3000`

beforeAll(async () => {
  db = await createTestDb()
  ;({ schoolA, schoolB } = await createTwoSchools(db))
})

beforeEach(() => {
  app = createTestApp(db)
})

async function loginAs(role: typeof ROLES[number], school = schoolA) {
  const user = await createUser(db, school, { role })
  return { user, cookie: await app.login(hostOf(school.slug), user.email, DEFAULT_TEST_PASSWORD) }
}

const resetPassword = (id: string, cookie?: string, slug = schoolA.slug) =>
  app.request(`/api/users/${id}/reset-password`, { host: hostOf(slug), cookie, method: 'POST' })

describe('permissions', () => {
  it.each(ROLES.map(role => [role, role === 'admin' ? 200 : 403] as const))('GET /api/users as %s → %i', async (role, status) => {
    const { cookie } = await loginAs(role)
    expect((await app.request('/api/users', { host: hostOf(schoolA.slug), cookie })).status).toBe(status)
  })

  it('GET /api/users without a session → 401', async () => {
    expect((await app.request('/api/users', { host: hostOf(schoolA.slug) })).status).toBe(401)
  })

  it.each(ROLES.map(role => [role, role === 'admin' ? 200 : 403] as const))('POST /api/users/:id/reset-password as %s → %i', async (role, status) => {
    const target = await createUser(db, schoolA)
    const { cookie } = await loginAs(role)
    expect((await resetPassword(target.id, cookie)).status).toBe(status)
  })

  it('POST /api/users/:id/reset-password without a session → 401', async () => {
    const target = await createUser(db, schoolA)
    expect((await resetPassword(target.id)).status).toBe(401)
  })
})

describe('GET /api/users', () => {
  it('lists only the current school\'s users, sorted by name, without sensitive fields', async () => {
    const { cookie } = await loginAs('admin', schoolB)
    await createUser(db, schoolB, { name: 'Zainab Musa' })
    await createUser(db, schoolB, { name: 'Bayo Ade' })
    await createUser(db, schoolA, { name: 'Other School User' })

    const res = await app.request('/api/users', { host: hostOf(schoolB.slug), cookie })
    const body = await res.json() as { users: Record<string, unknown>[] }

    const schoolBUsers = await db.select({ id: users.id }).from(users).where(eq(users.schoolId, schoolB.id))
    expect(body.users.map(u => u.id).sort()).toEqual(schoolBUsers.map(u => u.id).sort())
    const names = body.users.map(u => u.name as string)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    expect(Object.keys(body.users[0]!).sort()).toEqual(['email', 'id', 'isActive', 'lastLoginAt', 'mustChangePassword', 'name', 'role'])
    expect(JSON.stringify(body)).not.toContain('scrypt')
  })

  it('ignores a schoolId in the query string', async () => {
    const { cookie } = await loginAs('admin')
    const bUser = await createUser(db, schoolB)

    const res = await app.request(`/api/users?schoolId=${schoolB.id}`, { host: hostOf(schoolA.slug), cookie })
    const body = await res.json() as { users: { id: string }[] }

    expect(body.users.map(u => u.id)).not.toContain(bUser.id)
  })
})

describe('POST /api/users/:id/reset-password', () => {
  it('sets a temporary password that logs in, forces a change, and invalidates the old one', async () => {
    const { cookie } = await loginAs('admin')
    const target = await createUser(db, schoolA)

    const res = await resetPassword(target.id, cookie)
    const { temporaryPassword } = await res.json() as { temporaryPassword: string }

    expect(temporaryPassword).toHaveLength(10)
    const loginTemp = await app.postJson('/api/auth/login', { email: target.email, password: temporaryPassword }, { host: hostOf(schoolA.slug) })
    expect(loginTemp.status).toBe(200)
    expect((await loginTemp.json()).user.mustChangePassword).toBe(true)
    const loginOld = await app.postJson('/api/auth/login', { email: target.email, password: DEFAULT_TEST_PASSWORD }, { host: hostOf(schoolA.slug) })
    expect(loginOld.status).toBe(401)
  })

  it('returns 404 for another school\'s user and leaves them unchanged', async () => {
    const { cookie } = await loginAs('admin')
    const bUser = await createUser(db, schoolB)

    const res = await resetPassword(bUser.id, cookie)

    expect(res.status).toBe(404)
    const [row] = await db.select().from(users).where(eq(users.id, bUser.id))
    expect(row!.passwordHash).toBe(bUser.passwordHash)
    expect(row!.mustChangePassword).toBe(false)
  })

  it('returns 404 for an unknown id', async () => {
    const { cookie } = await loginAs('admin')
    expect((await resetPassword('00000000-0000-4000-8000-000000000000', cookie)).status).toBe(404)
  })

  it('returns 400 for the admin\'s own id', async () => {
    const { user, cookie } = await loginAs('admin')
    expect((await resetPassword(user.id, cookie)).status).toBe(400)
  })

  it('returns 400 for an id that is not a uuid', async () => {
    const { cookie } = await loginAs('admin')
    expect((await resetPassword('not-a-uuid', cookie)).status).toBe(400)
  })
})

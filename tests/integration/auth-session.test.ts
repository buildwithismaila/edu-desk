import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
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

async function loggedIn(overrides: Parameters<typeof createUser>[2] = {}) {
  const user = await createUser(db, schoolA, overrides)
  const cookie = await app.login(hostOf(schoolA.slug), user.email, DEFAULT_TEST_PASSWORD)
  return { user, cookie }
}

const onA = (cookie?: string) => ({ host: hostOf(schoolA.slug), cookie })

/** True when the response tells the browser to drop the session cookie. */
const clearsSession = (res: Response) =>
  res.headers.getSetCookie().some(c => c.startsWith('nuxt-session=;') || /^nuxt-session=[^;]*;.*Max-Age=0/i.test(c))

describe('session', () => {
  it('authenticates later requests with the session cookie', async () => {
    const { user, cookie } = await loggedIn()

    const res = await app.request('/__test/require-user', onA(cookie))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: user.id })
  })

  it('returns 401 without a session', async () => {
    expect((await app.request('/__test/require-user', onA())).status).toBe(401)
  })

  it('exposes the user but never the secure data on /api/_auth/session', async () => {
    const { user, cookie } = await loggedIn({ name: 'Ada Obi', role: 'principal' })

    const body = await (await app.request('/api/_auth/session', onA(cookie))).json()

    expect(body.user).toEqual({ id: user.id, name: 'Ada Obi', role: 'principal', mustChangePassword: false })
    expect(body.secure).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain(schoolA.id)
  })

  it('rejects a School A session on School B\'s host and clears it', async () => {
    const { cookie } = await loggedIn()

    const res = await app.request('/__test/require-user', { host: hostOf(schoolB.slug), cookie })
    expect(res.status).toBe(401)
    expect(clearsSession(res)).toBe(true)

    const session = await app.request('/api/_auth/session', { host: hostOf(schoolB.slug), cookie })
    expect(session.status).toBe(401)
    expect(clearsSession(session)).toBe(true)
    expect(JSON.stringify(await session.json())).not.toContain('user')
  })

  it('rejects the session once the user is deactivated', async () => {
    const { user, cookie } = await loggedIn()
    await db.update(users).set({ isActive: false }).where(eq(users.id, user.id))

    const res = await app.request('/__test/require-user', onA(cookie))

    expect(res.status).toBe(401)
    expect(clearsSession(res)).toBe(true)
  })

  it('rejects the session once the user is removed (soft-deleted)', async () => {
    const { user, cookie } = await loggedIn()
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, user.id))

    const res = await app.request('/__test/require-user', onA(cookie))

    expect(res.status).toBe(401)
    expect(clearsSession(res)).toBe(true)
  })

  it('rejects the session once the user is deleted', async () => {
    const { user, cookie } = await loggedIn()
    await db.delete(users).where(eq(users.id, user.id))

    expect((await app.request('/__test/require-user', onA(cookie))).status).toBe(401)
  })
})

describe('requireRole', () => {
  it('allows a listed role', async () => {
    const { cookie } = await loggedIn({ role: 'admin' })
    expect((await app.request('/__test/require-admin', onA(cookie))).status).toBe(200)
  })

  it('returns 403 for a role that is not listed', async () => {
    const { cookie } = await loggedIn({ role: 'teacher' })
    expect((await app.request('/__test/require-admin', onA(cookie))).status).toBe(403)
  })

  it('returns 401 without a session', async () => {
    expect((await app.request('/__test/require-admin', onA())).status).toBe(401)
  })

  it('uses the current role from the database, not the one in the session', async () => {
    const { user, cookie } = await loggedIn({ role: 'admin' })
    await db.update(users).set({ role: 'teacher' }).where(eq(users.id, user.id))

    expect((await app.request('/__test/require-admin', onA(cookie))).status).toBe(403)
  })
})

describe('POST /api/auth/logout', () => {
  it('ends the session', async () => {
    const { cookie } = await loggedIn()

    const res = await app.request('/api/auth/logout', { ...onA(cookie), method: 'POST' })
    expect(res.status).toBe(200)
    expect(clearsSession(res)).toBe(true)

    // The browser drops the cookie. (Sealed cookies can't be revoked server-side: a copied cookie stays
    // valid until it expires — see PROGRESS known issues. Deactivating the user does revoke it.)
    const after = await app.request('/__test/require-user', onA())
    expect(after.status).toBe(401)
  })

  it('succeeds without a session', async () => {
    expect((await app.request('/api/auth/logout', { ...onA(), method: 'POST' })).status).toBe(200)
  })
})

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { users } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createTwoSchools } from '../factories/schools'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp, sessionCookie } from '../helpers/app'
import { createTestDb } from '../helpers/db'

let db: Db
let app: ReturnType<typeof createTestApp>
let schoolA: Awaited<ReturnType<typeof createTwoSchools>>['schoolA']

const host = () => `${schoolA.slug}.lvh.me:3000`

beforeAll(async () => {
  db = await createTestDb()
  ;({ schoolA } = await createTwoSchools(db))
})

beforeEach(() => {
  app = createTestApp(db)
})

const change = (cookie: string | undefined, body: Record<string, unknown>) =>
  app.postJson('/api/auth/password', body, { host: host(), cookie })

const validChange = { currentPassword: DEFAULT_TEST_PASSWORD, newPassword: 'brand-new-password', confirmPassword: 'brand-new-password' }

async function loggedIn(overrides: Parameters<typeof createUser>[2] = {}) {
  const user = await createUser(db, schoolA, overrides)
  return { user, cookie: await app.login(host(), user.email, DEFAULT_TEST_PASSWORD) }
}

describe('POST /api/auth/password', () => {
  it('changes the password: the new one works and the old one does not', async () => {
    const { user, cookie } = await loggedIn()

    const res = await change(cookie, validChange)
    expect(res.status).toBe(200)

    const loginNew = await app.postJson('/api/auth/login', { email: user.email, password: 'brand-new-password' }, { host: host() })
    const loginOld = await app.postJson('/api/auth/login', { email: user.email, password: DEFAULT_TEST_PASSWORD }, { host: host() })
    expect(loginNew.status).toBe(200)
    expect(loginOld.status).toBe(401)
  })

  it('clears mustChangePassword in the DB and in the session', async () => {
    const { user, cookie } = await loggedIn({ mustChangePassword: true })

    const res = await change(cookie, validChange)
    expect((await res.json()).user.mustChangePassword).toBe(false)

    const [row] = await db.select({ mustChangePassword: users.mustChangePassword }).from(users).where(eq(users.id, user.id))
    expect(row!.mustChangePassword).toBe(false)

    const session = await app.request('/api/_auth/session', { host: host(), cookie: sessionCookie(res) ?? cookie })
    expect((await session.json()).user.mustChangePassword).toBe(false)
  })

  it('returns 400 with a field error when the current password is wrong, and keeps the password', async () => {
    const { user, cookie } = await loggedIn()

    const res = await change(cookie, { ...validChange, currentPassword: 'not-my-password' })

    expect(res.status).toBe(400)
    expect((await res.json()).data.fieldErrors.currentPassword).toEqual(['Current password is incorrect'])
    const login = await app.postJson('/api/auth/login', { email: user.email, password: DEFAULT_TEST_PASSWORD }, { host: host() })
    expect(login.status).toBe(200)
  })

  it('returns 400 for a too-short new password', async () => {
    const { cookie } = await loggedIn()

    const res = await change(cookie, { ...validChange, newPassword: 'short', confirmPassword: 'short' })

    expect(res.status).toBe(400)
    expect(Object.keys((await res.json()).data.fieldErrors)).toContain('newPassword')
  })

  it('returns 401 when not logged in', async () => {
    expect((await change(undefined, validChange)).status).toBe(401)
  })
})

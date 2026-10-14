import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { users } from '~~/server/database/schema'
import { LOGIN_THROTTLE, resetLoginThrottle } from '~~/server/utils/login-throttle'
import type { Db } from '~~/server/utils/db'
import { createTwoSchools } from '../factories/schools'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp, sessionCookie } from '../helpers/app'
import { createTestDb } from '../helpers/db'
import { resetTestRuntimeConfig, testRuntimeConfig } from '../helpers/nitro-imports'

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

const loginAt = (slug: string, email: string, password = DEFAULT_TEST_PASSWORD) =>
  app.postJson('/api/auth/login', { login: email, password }, { host: hostOf(slug) })

describe('POST /api/auth/login', () => {
  it('logs in with valid credentials and sets a host-only HttpOnly session cookie', async () => {
    const user = await createUser(db, schoolA, { name: 'Ada Obi', role: 'bursar' })

    const res = await loginAt(schoolA.slug, user.email)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ user: { id: user.id, name: 'Ada Obi', role: 'bursar', mustChangePassword: false } })
    const setCookie = res.headers.getSetCookie().find(c => c.startsWith('nuxt-session='))!
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
    expect(setCookie).not.toMatch(/Domain=/i)
  })

  it('records the last login time', async () => {
    const user = await createUser(db, schoolA)
    await loginAt(schoolA.slug, user.email)

    const [row] = await db.select({ lastLoginAt: users.lastLoginAt }).from(users).where(eq(users.id, user.id))
    expect(row!.lastLoginAt).toBeInstanceOf(Date)
  })

  it('ignores email case and surrounding spaces', async () => {
    await createUser(db, schoolA, { email: 'mixed.case@example.test' })
    expect((await loginAt(schoolA.slug, '  Mixed.Case@Example.TEST ')).status).toBe(200)
  })

  it('gives the same 401 for a wrong password and an unknown email, without a session', async () => {
    const user = await createUser(db, schoolA)

    const wrongPassword = await loginAt(schoolA.slug, user.email, 'wrong-password')
    const unknownEmail = await loginAt(schoolA.slug, 'nobody@example.test')

    expect(wrongPassword.status).toBe(401)
    expect(unknownEmail.status).toBe(401)
    const [a, b] = [await wrongPassword.json(), await unknownEmail.json()]
    expect(a.message).toBe('Invalid email, phone or password')
    expect(b.message).toBe(a.message)
    expect(sessionCookie(wrongPassword)).toBeUndefined()
  })

  it('treats a removed user like an unknown email (401), even with the right password', async () => {
    const user = await createUser(db, schoolA, { deletedAt: new Date(), isActive: false })

    const res = await loginAt(schoolA.slug, user.email)

    expect(res.status).toBe(401)
    expect((await res.json()).message).toBe('Invalid email, phone or password')
    expect(sessionCookie(res)).toBeUndefined()
  })

  it('rejects an inactive user with 403 only when the password is correct', async () => {
    const user = await createUser(db, schoolA, { isActive: false })

    const correct = await loginAt(schoolA.slug, user.email)
    expect(correct.status).toBe(403)
    expect((await correct.json()).message).toBe('Your account is disabled. Contact your school admin.')
    expect(sessionCookie(correct)).toBeUndefined()

    expect((await loginAt(schoolA.slug, user.email, 'wrong-password')).status).toBe(401)
  })

  it('rejects School A credentials on School B\'s host', async () => {
    const user = await createUser(db, schoolA)

    const res = await loginAt(schoolB.slug, user.email)

    expect(res.status).toBe(401)
    expect(sessionCookie(res)).toBeUndefined()
  })

  it('logs the same email into each school only with that school\'s password', async () => {
    await createUser(db, schoolA, { email: 'shared@example.test', password: 'password-for-a' })
    await createUser(db, schoolB, { email: 'shared@example.test', password: 'password-for-b' })

    expect((await loginAt(schoolA.slug, 'shared@example.test', 'password-for-a')).status).toBe(200)
    expect((await loginAt(schoolB.slug, 'shared@example.test', 'password-for-b')).status).toBe(200)
    expect((await loginAt(schoolA.slug, 'shared@example.test', 'password-for-b')).status).toBe(401)
    expect((await loginAt(schoolB.slug, 'shared@example.test', 'password-for-a')).status).toBe(401)
  })

  it('logs into the host\'s school even if the body names another school', async () => {
    const user = await createUser(db, schoolA)

    const res = await app.postJson('/api/auth/login', { login: user.email, password: DEFAULT_TEST_PASSWORD, schoolId: schoolB.id }, { host: hostOf(schoolA.slug) })
    expect(res.status).toBe(200)

    const session = await app.request('/api/_auth/session', { host: hostOf(schoolA.slug), cookie: sessionCookie(res) })
    expect((await session.json()).user.id).toBe(user.id)
  })

  it('returns 400 with field errors for an invalid body', async () => {
    const res = await app.postJson('/api/auth/login', { login: 'not-an-email', password: '' }, { host: hostOf(schoolA.slug) })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(Object.keys(body.data.fieldErrors).sort()).toEqual(['login', 'password'])
  })

  it('returns 429 with Retry-After after too many failed attempts, even with the right password', async () => {
    const user = await createUser(db, schoolA)
    for (let i = 0; i < LOGIN_THROTTLE.maxPerAccount; i++) {
      expect((await loginAt(schoolA.slug, user.email, 'wrong-password')).status).toBe(401)
    }

    const res = await loginAt(schoolA.slug, user.email)

    expect(res.status).toBe(429)
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await res.json()).message).toMatch(/Too many attempts/)
  })

  it.each(['08031230001', '0803 123 0001', '+234 803 123 0001'])('logs in by phone written as %j', async (phone) => {
    const user = await createUser(db, schoolA, { role: 'parent', email: null, phone: '+2348031230001' })

    const res = await loginAt(schoolA.slug, phone)

    expect(res.status).toBe(200)
    expect((await res.json()).user.id).toBe(user.id)
    await db.delete(users).where(eq(users.id, user.id))
  })

  it('rejects a phone that belongs to another school\'s account', async () => {
    await createUser(db, schoolB, { role: 'parent', phone: '+2348031230002' })
    expect((await loginAt(schoolA.slug, '08031230002')).status).toBe(401)
  })

  it('logs in the active account when a removed account had the same phone', async () => {
    await createUser(db, schoolA, { phone: '+2348031230003', deletedAt: new Date(), password: 'old-password-1' })
    const current = await createUser(db, schoolA, { phone: '+2348031230003' })

    const res = await loginAt(schoolA.slug, '08031230003')

    expect(res.status).toBe(200)
    expect((await res.json()).user.id).toBe(current.id)
  })

  it('returns 404 on an unknown school', async () => {
    const res = await loginAt('no-such-school', 'a@example.test')
    expect(res.status).toBe(404)
  })
})

describe('the per-IP login limit behind a proxy (Caddy in production)', () => {
  const maxPerIp = LOGIN_THROTTLE.maxPerIp
  const failFrom = (ip: string, email: string) =>
    app.postJson('/api/auth/login', { login: email, password: 'wrong-password' }, { host: hostOf(schoolA.slug), headers: { 'x-forwarded-for': ip } })

  beforeEach(() => {
    resetLoginThrottle()
    LOGIN_THROTTLE.maxPerIp = 2
  })
  afterEach(() => {
    LOGIN_THROTTLE.maxPerIp = maxPerIp
    resetTestRuntimeConfig()
    resetLoginThrottle()
  })

  it('counts each visitor separately when the proxy is trusted', async () => {
    testRuntimeConfig.trustProxy = true
    // Different accounts, so only the IP limit applies
    expect((await failFrom('203.0.113.1', 'a1@example.test')).status).toBe(401)
    expect((await failFrom('203.0.113.1', 'a2@example.test')).status).toBe(401)
    expect((await failFrom('203.0.113.1', 'a3@example.test')).status).toBe(429)
    // Another visitor isn't blocked by the first one's failures
    expect((await failFrom('198.51.100.7', 'a4@example.test')).status).toBe(401)
  })

  it('ignores X-Forwarded-For when not behind a trusted proxy (a client could fake it)', async () => {
    expect((await failFrom('203.0.113.1', 'b1@example.test')).status).toBe(401)
    expect((await failFrom('203.0.113.2', 'b2@example.test')).status).toBe(401)
    // Same real connection, so the made-up header doesn't help
    expect((await failFrom('203.0.113.3', 'b3@example.test')).status).toBe(429)
  })
})

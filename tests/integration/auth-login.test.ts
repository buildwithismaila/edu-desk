import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { users } from '~~/server/database/schema'
import { LOGIN_THROTTLE } from '~~/server/utils/login-throttle'
import type { Db } from '~~/server/utils/db'
import { createTwoSchools } from '../factories/schools'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp, sessionCookie } from '../helpers/app'
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

const loginAt = (slug: string, email: string, password = DEFAULT_TEST_PASSWORD) =>
  app.postJson('/api/auth/login', { email, password }, { host: hostOf(slug) })

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
    expect(a.message).toBe('Invalid email or password')
    expect(b.message).toBe(a.message)
    expect(sessionCookie(wrongPassword)).toBeUndefined()
  })

  it('treats a removed user like an unknown email (401), even with the right password', async () => {
    const user = await createUser(db, schoolA, { deletedAt: new Date(), isActive: false })

    const res = await loginAt(schoolA.slug, user.email)

    expect(res.status).toBe(401)
    expect((await res.json()).message).toBe('Invalid email or password')
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

    const res = await app.postJson('/api/auth/login', { email: user.email, password: DEFAULT_TEST_PASSWORD, schoolId: schoolB.id }, { host: hostOf(schoolA.slug) })
    expect(res.status).toBe(200)

    const session = await app.request('/api/_auth/session', { host: hostOf(schoolA.slug), cookie: sessionCookie(res) })
    expect((await session.json()).user.id).toBe(user.id)
  })

  it('returns 400 with field errors for an invalid body', async () => {
    const res = await app.postJson('/api/auth/login', { email: 'not-an-email', password: '' }, { host: hostOf(schoolA.slug) })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(Object.keys(body.data.fieldErrors).sort()).toEqual(['email', 'password'])
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

  it('returns 404 on an unknown school', async () => {
    const res = await loginAt('no-such-school', 'a@example.test')
    expect(res.status).toBe(404)
  })
})

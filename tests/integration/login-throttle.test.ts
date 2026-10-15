import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '~~/server/utils/db'
import {
  checkLoginThrottle,
  LOGIN_THROTTLE,
  recordLoginFailure,
  recordLoginSuccess,
  resetLoginThrottle,
} from '~~/server/utils/login-throttle'
import { createTestDb } from '../helpers/db'

// The limiter lives in the database (decision 046), so every app instance shares the counts. Same rules as the
// in-memory limiter it replaced (decision 012): these are its tests, moved here, with time passed in.

let db: Db
const keys = { account: 'school-a:ada@example.test', ip: '10.0.0.1' }
const T0 = Date.parse('2026-10-15T08:00:00Z')

async function fail(times: number, k = keys, now = T0) {
  for (let i = 0; i < times; i++) await recordLoginFailure(db, k, now)
}

beforeAll(async () => {
  db = await createTestDb()
})

beforeEach(async () => {
  await resetLoginThrottle(db)
})

describe('login throttle', () => {
  it('allows attempts below the per-account limit', async () => {
    await fail(LOGIN_THROTTLE.maxPerAccount - 1)
    expect(await checkLoginThrottle(db, keys, T0)).toEqual({ allowed: true })
  })

  it('blocks the account after the limit, with the seconds until the window ends', async () => {
    await fail(LOGIN_THROTTLE.maxPerAccount)
    expect(await checkLoginThrottle(db, keys, T0)).toEqual({ allowed: false, retryAfterSeconds: LOGIN_THROTTLE.windowMs / 1000 })
    expect(await checkLoginThrottle(db, keys, T0 + 60_000)).toEqual({ allowed: false, retryAfterSeconds: LOGIN_THROTTLE.windowMs / 1000 - 60 })
  })

  it('unblocks once the window has passed, and starts a new window on the next failure', async () => {
    await fail(LOGIN_THROTTLE.maxPerAccount)
    const later = T0 + LOGIN_THROTTLE.windowMs
    expect(await checkLoginThrottle(db, keys, later)).toEqual({ allowed: true })
    await fail(LOGIN_THROTTLE.maxPerAccount - 1, keys, later)
    expect(await checkLoginThrottle(db, keys, later)).toEqual({ allowed: true })
  })

  it('a successful login resets the account counter', async () => {
    await fail(LOGIN_THROTTLE.maxPerAccount - 1)
    await recordLoginSuccess(db, keys)
    await fail(LOGIN_THROTTLE.maxPerAccount - 1)
    expect(await checkLoginThrottle(db, keys, T0)).toEqual({ allowed: true })
  })

  it('counts each account separately (same email at another school is another account)', async () => {
    await fail(LOGIN_THROTTLE.maxPerAccount)
    expect(await checkLoginThrottle(db, { ...keys, account: 'school-b:ada@example.test' }, T0)).toEqual({ allowed: true })
  })

  it('blocks an IP that fails across many accounts', async () => {
    for (let i = 0; i < LOGIN_THROTTLE.maxPerIp; i++) await recordLoginFailure(db, { account: `school-a:user${i}@example.test`, ip: keys.ip }, T0)

    expect((await checkLoginThrottle(db, { account: 'school-a:fresh@example.test', ip: keys.ip }, T0)).allowed).toBe(false)
    expect((await checkLoginThrottle(db, { account: 'school-a:fresh@example.test', ip: '10.0.0.2' }, T0)).allowed).toBe(true)
  })

  it('a successful login does not reset the IP counter', async () => {
    for (let i = 0; i < LOGIN_THROTTLE.maxPerIp; i++) await recordLoginFailure(db, { account: `school-a:user${i}@example.test`, ip: keys.ip }, T0)
    await recordLoginSuccess(db, keys)
    expect((await checkLoginThrottle(db, keys, T0)).allowed).toBe(false)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkLoginThrottle,
  LOGIN_THROTTLE,
  recordLoginFailure,
  recordLoginSuccess,
  resetLoginThrottle,
} from '~~/server/utils/login-throttle'

const keys = { account: 'school-a:ada@example.test', ip: '10.0.0.1' }

function fail(times: number, k = keys) {
  for (let i = 0; i < times; i++) recordLoginFailure(k)
}

beforeEach(() => {
  vi.useFakeTimers()
  resetLoginThrottle()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('login throttle', () => {
  it('allows attempts below the per-account limit', () => {
    fail(LOGIN_THROTTLE.maxPerAccount - 1)
    expect(checkLoginThrottle(keys)).toEqual({ allowed: true })
  })

  it('blocks the account after the limit, with the seconds until the window ends', () => {
    fail(LOGIN_THROTTLE.maxPerAccount)
    expect(checkLoginThrottle(keys)).toEqual({ allowed: false, retryAfterSeconds: LOGIN_THROTTLE.windowMs / 1000 })

    vi.advanceTimersByTime(60_000)
    expect(checkLoginThrottle(keys)).toEqual({ allowed: false, retryAfterSeconds: LOGIN_THROTTLE.windowMs / 1000 - 60 })
  })

  it('unblocks once the window has passed', () => {
    fail(LOGIN_THROTTLE.maxPerAccount)
    vi.advanceTimersByTime(LOGIN_THROTTLE.windowMs)
    expect(checkLoginThrottle(keys)).toEqual({ allowed: true })
  })

  it('a successful login resets the account counter', () => {
    fail(LOGIN_THROTTLE.maxPerAccount - 1)
    recordLoginSuccess(keys)
    fail(LOGIN_THROTTLE.maxPerAccount - 1)
    expect(checkLoginThrottle(keys)).toEqual({ allowed: true })
  })

  it('counts each account separately (same email at another school is another account)', () => {
    fail(LOGIN_THROTTLE.maxPerAccount)
    expect(checkLoginThrottle({ ...keys, account: 'school-b:ada@example.test' })).toEqual({ allowed: true })
  })

  it('blocks an IP that fails across many accounts', () => {
    for (let i = 0; i < LOGIN_THROTTLE.maxPerIp; i++) recordLoginFailure({ account: `school-a:user${i}@example.test`, ip: keys.ip })

    expect(checkLoginThrottle({ account: 'school-a:fresh@example.test', ip: keys.ip }).allowed).toBe(false)
    expect(checkLoginThrottle({ account: 'school-a:fresh@example.test', ip: '10.0.0.2' }).allowed).toBe(true)
  })

  it('a successful login does not reset the IP counter', () => {
    for (let i = 0; i < LOGIN_THROTTLE.maxPerIp; i++) recordLoginFailure({ account: `school-a:user${i}@example.test`, ip: keys.ip })
    recordLoginSuccess(keys)
    expect(checkLoginThrottle(keys).allowed).toBe(false)
  })
})

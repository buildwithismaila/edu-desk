import { inArray, lte, sql } from 'drizzle-orm'
import { loginFailures } from '../database/schema'
import type { Db } from './db'

// Failed-login limiter, kept in the database so every app instance (Cloudflare runs many) shares the counts
// (decision 046). Counts failures only, per account (school + login) and per IP, in a fixed window from the
// first failure.

export const LOGIN_THROTTLE = {
  windowMs: 15 * 60_000,
  maxPerAccount: 5,
  maxPerIp: 50,
}

export interface LoginThrottleKeys {
  /** `${schoolId}:${email or phone}` */
  account: string
  ip: string
}

type ThrottleResult = { allowed: true } | { allowed: false, retryAfterSeconds: number }

const keysOf = ({ account, ip }: LoginThrottleKeys) => [`account:${account}`, `ip:${ip}`]
const at = (ms: number) => sql`${new Date(ms).toISOString()}::timestamptz`

export async function checkLoginThrottle(db: Db, keys: LoginThrottleKeys, now = Date.now()): Promise<ThrottleResult> {
  const [accountKey, ipKey] = keysOf(keys)
  const rows = await db.select().from(loginFailures).where(inArray(loginFailures.key, [accountKey!, ipKey!]))
  const blocked = rows.filter(r => r.resetAt.getTime() > now && r.count >= (r.key === accountKey ? LOGIN_THROTTLE.maxPerAccount : LOGIN_THROTTLE.maxPerIp))
  if (!blocked.length) return { allowed: true }
  const resetAt = Math.max(...blocked.map(r => r.resetAt.getTime()))
  return { allowed: false, retryAfterSeconds: Math.ceil((resetAt - now) / 1000) }
}

export async function recordLoginFailure(db: Db, keys: LoginThrottleKeys, now = Date.now()) {
  const expired = sql`${loginFailures.resetAt} <= ${at(now)}`
  await db.insert(loginFailures)
    .values(keysOf(keys).map(key => ({ key, count: 1, resetAt: new Date(now + LOGIN_THROTTLE.windowMs) })))
    .onConflictDoUpdate({
      target: loginFailures.key,
      // A finished window starts again at 1
      set: {
        count: sql`case when ${expired} then 1 else ${loginFailures.count} + 1 end`,
        resetAt: sql`case when ${expired} then excluded.reset_at else ${loginFailures.resetAt} end`,
      },
    })
  // Keep the table small: windows that ended a day ago are gone
  await db.delete(loginFailures).where(lte(loginFailures.resetAt, new Date(now - 24 * 60 * 60_000)))
}

/** Clears the account counter; the IP counter keeps counting so one success can't reset a spray. */
export async function recordLoginSuccess(db: Db, keys: LoginThrottleKeys) {
  await db.delete(loginFailures).where(inArray(loginFailures.key, [keysOf(keys)[0]!]))
}

/** Tests only. */
export async function resetLoginThrottle(db: Db) {
  await db.delete(loginFailures)
}

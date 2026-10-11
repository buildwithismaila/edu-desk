// In-memory failed-login limiter (single instance; move to shared storage if we run several).
// Counts failures only, per account (school + email) and per IP, in a fixed window from the first failure.

export const LOGIN_THROTTLE = {
  windowMs: 15 * 60_000,
  maxPerAccount: 5,
  maxPerIp: 50,
}

export interface LoginThrottleKeys {
  /** `${schoolId}:${email}` */
  account: string
  ip: string
}

type ThrottleResult = { allowed: true } | { allowed: false, retryAfterSeconds: number }

const failures = new Map<string, { count: number, resetAt: number }>()

function current(key: string, now: number) {
  const entry = failures.get(key)
  if (entry && entry.resetAt <= now) {
    failures.delete(key)
    return undefined
  }
  return entry
}

export function checkLoginThrottle({ account, ip }: LoginThrottleKeys): ThrottleResult {
  const now = Date.now()
  const blocked = [
    { entry: current(`account:${account}`, now), max: LOGIN_THROTTLE.maxPerAccount },
    { entry: current(`ip:${ip}`, now), max: LOGIN_THROTTLE.maxPerIp },
  ].filter(({ entry, max }) => entry && entry.count >= max)

  if (blocked.length === 0) return { allowed: true }
  const resetAt = Math.max(...blocked.map(({ entry }) => entry!.resetAt))
  return { allowed: false, retryAfterSeconds: Math.ceil((resetAt - now) / 1000) }
}

export function recordLoginFailure({ account, ip }: LoginThrottleKeys) {
  const now = Date.now()
  for (const key of [`account:${account}`, `ip:${ip}`]) {
    const entry = current(key, now)
    if (entry) entry.count += 1
    else failures.set(key, { count: 1, resetAt: now + LOGIN_THROTTLE.windowMs })
  }
  if (failures.size > 10_000) pruneExpired(now)
}

/** Clears the account counter; the IP counter keeps counting so one success can't reset a spray. */
export function recordLoginSuccess({ account }: LoginThrottleKeys) {
  failures.delete(`account:${account}`)
}

function pruneExpired(now: number) {
  for (const [key, entry] of failures) {
    if (entry.resetAt <= now) failures.delete(key)
  }
}

/** Tests only. */
export function resetLoginThrottle() {
  failures.clear()
}

import { eq, isNull } from 'drizzle-orm'
import { createError, defineEventHandler, setResponseHeader } from 'h3'
import { useRuntimeConfig } from '#imports'
import { loginSchema } from '../../../shared/schemas/auth'
import { users } from '../../database/schema'
import { toSessionUser } from '../../utils/auth'
import { clientIp, type TrustProxy } from '../../utils/client-ip'
import { useDb } from '../../utils/db'
import { checkLoginThrottle, recordLoginFailure, recordLoginSuccess } from '../../utils/login-throttle'
import { requireTenant, whereSchool } from '../../utils/tenant'
import { validateBody } from '../../utils/validation'

// Verified against when the email is unknown, so both failures take about as long
let timingHash: Promise<string> | undefined

export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const { login, password } = await validateBody(event, loginSchema)
  const identifier = 'email' in login ? login.email : login.phone

  // Behind a proxy every request comes from the proxy: use the visitor's address it passes on (client-ip.ts)
  const ip = clientIp(event, useRuntimeConfig(event).trustProxy as TrustProxy) ?? 'unknown'
  const keys = { account: `${school.id}:${identifier}`, ip }
  const db = useDb()
  const throttle = await checkLoginThrottle(db, keys)
  if (!throttle.allowed) {
    setResponseHeader(event, 'Retry-After', throttle.retryAfterSeconds)
    const minutes = Math.ceil(throttle.retryAfterSeconds / 60)
    throw createError({
      statusCode: 429,
      statusMessage: 'Too Many Requests',
      message: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    })
  }

  // Email or phone (Phase 4). Removed (soft-deleted) users are treated like unknown logins
  const byLogin = 'email' in login ? eq(users.email, login.email) : eq(users.phone, login.phone)
  const [user] = await db.select().from(users).where(whereSchool(users, school, byLogin, isNull(users.deletedAt)))

  let valid = false
  if (user) valid = await verifyPassword(user.passwordHash, password)
  else await verifyPassword(await (timingHash ??= hashPassword('timing-equaliser')), password)

  if (!user || !valid) {
    await recordLoginFailure(db, keys)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'Invalid email, phone or password' })
  }
  if (!user.isActive) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Your account is disabled. Contact your school admin.' })
  }

  await recordLoginSuccess(db, keys)
  await db.update(users).set({ lastLoginAt: new Date() }).where(whereSchool(users, school, eq(users.id, user.id)))

  const sessionUser = toSessionUser(user)
  await replaceUserSession(event, { user: sessionUser, secure: { schoolId: school.id } })
  return { user: sessionUser }
})

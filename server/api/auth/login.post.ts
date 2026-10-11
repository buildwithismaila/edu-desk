import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRequestIP, setResponseHeader } from 'h3'
import { loginSchema } from '../../../shared/schemas/auth'
import { users } from '../../database/schema'
import { toSessionUser } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { checkLoginThrottle, recordLoginFailure, recordLoginSuccess } from '../../utils/login-throttle'
import { requireTenant, whereSchool } from '../../utils/tenant'
import { validateBody } from '../../utils/validation'

// Verified against when the email is unknown, so both failures take about as long
let timingHash: Promise<string> | undefined

export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const { email, password } = await validateBody(event, loginSchema)

  const keys = { account: `${school.id}:${email}`, ip: getRequestIP(event) ?? 'unknown' }
  const throttle = checkLoginThrottle(keys)
  if (!throttle.allowed) {
    setResponseHeader(event, 'Retry-After', throttle.retryAfterSeconds)
    const minutes = Math.ceil(throttle.retryAfterSeconds / 60)
    throw createError({
      statusCode: 429,
      statusMessage: 'Too Many Requests',
      message: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    })
  }

  const db = useDb()
  const [user] = await db.select().from(users).where(whereSchool(users, school, eq(users.email, email)))

  let valid = false
  if (user) valid = await verifyPassword(user.passwordHash, password)
  else await verifyPassword(await (timingHash ??= hashPassword('timing-equaliser')), password)

  if (!user || !valid) {
    recordLoginFailure(keys)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'Invalid email or password' })
  }
  if (!user.isActive) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Your account is disabled. Contact your school admin.' })
  }

  recordLoginSuccess(keys)
  await db.update(users).set({ lastLoginAt: new Date() }).where(whereSchool(users, school, eq(users.id, user.id)))

  const sessionUser = toSessionUser(user)
  await replaceUserSession(event, { user: sessionUser, secure: { schoolId: school.id } })
  return { user: sessionUser }
})

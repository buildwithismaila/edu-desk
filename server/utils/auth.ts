import { eq, getTableColumns } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import type { UserSession } from '#auth-utils'
import { hasRole, type Role } from '../../shared/constants/roles'
import { type User, users } from '../database/schema'
import { useDb } from './db'
import { requireTenant, whereSchool } from './tenant'

// nuxt-auth-utils' getUserSession/clearUserSession/... are Nitro auto-imports here, not `#imports`
// (see tests/helpers/nitro-globals.ts for why).

/** A user row without the password hash. */
export type AuthUser = Omit<User, 'passwordHash'>

const { passwordHash: _passwordHash, ...authUserColumns } = getTableColumns(users)

/** What goes in the session's `user` (sent to the client). */
export function toSessionUser(user: Pick<User, 'id' | 'name' | 'role' | 'mustChangePassword'>) {
  return { id: user.id, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword }
}

const unauthorized = () => createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'Please log in' })

/**
 * The logged-in user of the current school, loaded fresh from the DB so deactivation and role
 * changes apply immediately. 401 (and the session is cleared) when there's no valid session.
 */
export async function requireUser(event: H3Event): Promise<AuthUser> {
  const school = requireTenant(event)
  const session = await getUserSession(event)
  if (!session.user) throw unauthorized()
  if (session.secure?.schoolId !== school.id) {
    await clearUserSession(event)
    throw unauthorized()
  }

  const [user] = await useDb()
    .select(authUserColumns)
    .from(users)
    .where(whereSchool(users, school, eq(users.id, session.user.id)))

  if (!user?.isActive) {
    await clearUserSession(event)
    throw unauthorized()
  }
  return user
}

/**
 * nuxt-auth-utils `fetch` hook (server/plugins/session-tenant.ts): a session belongs to the school it
 * was created on. Browsers don't send the host-only cookie to another subdomain, but a copied cookie
 * could be sent, so /api/_auth/session (and SSR, which calls it) treats it as logged out.
 * A hook, not middleware: h3 re-reads the request cookie after clearing, so middleware can't hide it.
 */
export async function rejectForeignSession(session: UserSession, event: H3Event) {
  if (session.user && session.secure?.schoolId !== event.context.school?.id) {
    await clearUserSession(event)
    throw unauthorized()
  }
}

/** requireUser, then 403 unless the user has one of `roles`. */
export async function requireRole(event: H3Event, roles: readonly Role[]): Promise<AuthUser> {
  const user = await requireUser(event)
  if (!hasRole(user, roles)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'You don\'t have access to this' })
  }
  return user
}

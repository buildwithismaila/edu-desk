import { asc } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { users } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant, whereSchool } from '../../utils/tenant'

/** Admin: the school's users. Small lists for now; pagination comes with staff management (Phase 3). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])

  const rows = await useDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(whereSchool(users, school))
    .orderBy(asc(users.name))

  return { users: rows }
})

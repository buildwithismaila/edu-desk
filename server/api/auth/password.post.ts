import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { changePasswordSchema } from '../../../shared/schemas/auth'
import { users } from '../../database/schema'
import { requireUser, toSessionUser } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant, whereSchool } from '../../utils/tenant'
import { fieldError, validateBody } from '../../utils/validation'

/** Any logged-in user changes their own password; clears a forced change after an admin reset. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireUser(event)
  const { currentPassword, newPassword } = await validateBody(event, changePasswordSchema)

  const db = useDb()
  const byId = whereSchool(users, school, eq(users.id, user.id))
  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(byId)
  if (!row || !await verifyPassword(row.passwordHash, currentPassword)) {
    throw fieldError('currentPassword', 'Current password is incorrect')
  }

  const [updated] = await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false })
    .where(byId)
    .returning()

  const sessionUser = toSessionUser(updated!)
  await replaceUserSession(event, { user: sessionUser, secure: { schoolId: school.id } })
  return { user: sessionUser }
})

import { eq, isNull } from 'drizzle-orm'
import { createError, defineEventHandler } from 'h3'
import { z } from 'zod'
import { users } from '../../../database/schema'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { generateTemporaryPassword } from '../../../utils/password'
import { requireTenant, whereSchool } from '../../../utils/tenant'
import { fieldError, validateParams } from '../../../utils/validation'

const paramsSchema = z.object({ id: z.uuid('Invalid user id') })

/** Admin: replaces a user's password with a one-time temporary one, shown once; they must change it. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const admin = await requireRole(event, ['admin'])
  const { id } = validateParams(event, paramsSchema)
  if (id === admin.id) throw fieldError('id', 'Use Change password for your own account')

  const temporaryPassword = generateTemporaryPassword()
  const [updated] = await useDb()
    .update(users)
    .set({ passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true, temporaryPasswordAt: new Date() })
    .where(whereSchool(users, school, eq(users.id, id), isNull(users.deletedAt)))
    .returning({ id: users.id })

  // Another school's user is "not found", so their existence isn't revealed
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'User not found' })
  return { temporaryPassword }
})

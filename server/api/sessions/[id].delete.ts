import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { academicSessions } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { conflict, notFound } from '../../utils/errors'
import { requireTenant, whereSchool } from '../../utils/tenant'
import { idParamsSchema, validateParams } from '../../utils/validation'

/** Admin: delete a session and its terms. Later phases add "has data" guards. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)

  const db = useDb()
  const byId = whereSchool(academicSessions, school, eq(academicSessions.id, id))
  const [session] = await db.select().from(academicSessions).where(byId)
  if (!session) throw notFound('Session not found')
  if (session.isCurrent) throw conflict('This is the current session. Make a term in another session current first.')

  await db.delete(academicSessions).where(byId)
  return { deleted: true }
})

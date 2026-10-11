import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { z } from 'zod'
import { sessionNameSchema } from '../../../shared/schemas/academics'
import { academicSessions } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { conflict, isUniqueViolation, notFound } from '../../utils/errors'
import { requireTenant, whereSchool } from '../../utils/tenant'
import { idParamsSchema, validateBody, validateParams } from '../../utils/validation'

/** Admin: rename a session. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)
  const { name } = await validateBody(event, z.object({ name: sessionNameSchema }))

  let session
  try {
    [session] = await useDb().update(academicSessions).set({ name })
      .where(whereSchool(academicSessions, school, eq(academicSessions.id, id)))
      .returning({ id: academicSessions.id, name: academicSessions.name, isCurrent: academicSessions.isCurrent })
  }
  catch (error) {
    if (isUniqueViolation(error)) throw conflict(`Session ${name} already exists`)
    throw error
  }
  if (!session) throw notFound('Session not found')
  return session
})

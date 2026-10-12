import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { academicSessions, attendanceRegisters, studentEnrolments, terms } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { conflict, notFound } from '../../utils/errors'
import { requireTenant, whereSchool } from '../../utils/tenant'
import { idParamsSchema, validateParams } from '../../utils/validation'

/** Admin: delete a session and its terms; 409 if it's current or has enrolled students or attendance. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)

  const db = useDb()
  const byId = whereSchool(academicSessions, school, eq(academicSessions.id, id))
  const [session] = await db.select().from(academicSessions).where(byId)
  if (!session) throw notFound('Session not found')
  if (session.isCurrent) throw conflict('This is the current session. Make a term in another session current first.')
  const [enrolled] = await db.select({ id: studentEnrolments.id }).from(studentEnrolments)
    .where(whereSchool(studentEnrolments, school, eq(studentEnrolments.sessionId, id))).limit(1)
  if (enrolled) throw conflict('This session has students enrolled, so it can\'t be deleted.')
  const [register] = await db.select({ id: attendanceRegisters.id }).from(attendanceRegisters)
    .innerJoin(terms, eq(attendanceRegisters.termId, terms.id))
    .where(whereSchool(attendanceRegisters, school, eq(terms.sessionId, id))).limit(1)
  if (register) throw conflict('This session has attendance records, so it can\'t be deleted.')

  await db.delete(academicSessions).where(byId)
  return { deleted: true }
})

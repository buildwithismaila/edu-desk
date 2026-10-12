import { defineEventHandler } from 'h3'
import { sessionQuerySchema } from '../../../shared/schemas/assignments'
import { listAssignments, requireSession } from '../../services/assignments'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateQuery } from '../../utils/validation'

/** Admin, principal: every arm's class teacher and subject teachers for a session (gaps as null). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'principal'])
  const { sessionId } = validateQuery(event, sessionQuerySchema)

  const db = useDb()
  const session = await requireSession(db, school, sessionId)
  return { session, arms: await listAssignments(db, school, session.id) }
})

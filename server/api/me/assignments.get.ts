import { defineEventHandler } from 'h3'
import { listUserAssignments, resolveSession } from '../../services/assignments'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'

/** The caller's own classes for the current session ("My classes"; attendance and scores build on it). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'principal', 'teacher'])

  const db = useDb()
  const session = await resolveSession(db, school)
  if (!session) return { session: null, classTeacherOf: [], subjects: [] }
  return { session, ...await listUserAssignments(db, school, user.id, session.id) }
})

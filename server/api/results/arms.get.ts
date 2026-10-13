import { defineEventHandler } from 'h3'
import { listResultArms } from '../../services/results'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'

/** The current term's arms with results status (teachers: their class-teacher arms). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'principal', 'teacher'])
  return listResultArms(useDb(), school, user)
})

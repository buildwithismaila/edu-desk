import { defineEventHandler } from 'h3'
import { summaryQuerySchema } from '../../../shared/schemas/attendance'
import { armAttendanceSummary } from '../../services/attendance'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateQuery } from '../../utils/validation'

/** Term attendance per student in an arm (default: current term). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'principal', 'teacher'])
  const { classArmId, termId } = validateQuery(event, summaryQuerySchema)
  return armAttendanceSummary(useDb(), school, user, classArmId, termId)
})

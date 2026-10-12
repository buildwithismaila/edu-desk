import { defineEventHandler } from 'h3'
import { registerQuerySchema } from '../../../shared/schemas/attendance'
import { SCHOOL_TIME_ZONE, todayIn } from '../../../shared/utils/dates'
import { getRegister } from '../../services/attendance'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateQuery } from '../../utils/validation'

/** An arm's register for a date (default today): admin, principal or the arm's class teacher. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'principal', 'teacher'])
  const { classArmId, date } = validateQuery(event, registerQuerySchema)
  const today = todayIn(SCHOOL_TIME_ZONE)
  return getRegister(useDb(), school, user, classArmId, date ?? today, today)
})

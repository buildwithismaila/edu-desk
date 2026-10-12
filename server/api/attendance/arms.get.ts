import { defineEventHandler } from 'h3'
import { SCHOOL_TIME_ZONE, todayIn } from '../../../shared/utils/dates'
import { listAttendanceArms } from '../../services/attendance'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'

/** Arms the user takes registers for (teachers: their class-teacher arms), with today's status. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'principal', 'teacher'])
  return listAttendanceArms(useDb(), school, user, todayIn(SCHOOL_TIME_ZONE))
})

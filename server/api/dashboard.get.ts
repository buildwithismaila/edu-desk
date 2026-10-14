import { defineEventHandler } from 'h3'
import { SCHOOL_TIME_ZONE, todayIn } from '../../shared/utils/dates'
import { getDashboard } from '../services/dashboard'
import { requireRole } from '../utils/auth'
import { useDb } from '../utils/db'
import { requireTenant } from '../utils/tenant'

/** Staff dashboard numbers for the current term (the bursar gets students and fees only). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const viewer = await requireRole(event, ['admin', 'principal', 'bursar'])
  return getDashboard(useDb(), school, viewer, todayIn(SCHOOL_TIME_ZONE))
})

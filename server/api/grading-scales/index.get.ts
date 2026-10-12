import { defineEventHandler } from 'h3'
import { STAFF_ROLES } from '../../../shared/constants/roles'
import { listGradingScales } from '../../services/grading'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'

/** Staff: `{ primary, jss, sss }` bands, highest first. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, STAFF_ROLES)
  return listGradingScales(useDb(), school)
})

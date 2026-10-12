import { defineEventHandler } from 'h3'
import { staffListQuerySchema } from '../../../shared/schemas/staff'
import { listStaff } from '../../services/staff'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateQuery } from '../../utils/validation'

/** Admin, principal: the school's staff (no parents, no removed accounts). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'principal'])
  const { status } = validateQuery(event, staffListQuerySchema)
  return listStaff(useDb(), school, status)
})

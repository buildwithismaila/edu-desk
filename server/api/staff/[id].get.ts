import { defineEventHandler } from 'h3'
import { z } from 'zod'
import { getStaffDetail } from '../../services/staff'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { idParamsSchema, validateParams, validateQuery } from '../../utils/validation'

/** Admin, principal: one staff member with their assignments for `?sessionId=` (default: current). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'principal'])
  const { id } = validateParams(event, idParamsSchema)
  const { sessionId } = validateQuery(event, z.object({ sessionId: z.uuid().optional() }))
  return getStaffDetail(useDb(), school, id, sessionId)
})

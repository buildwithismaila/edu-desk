import { defineEventHandler } from 'h3'
import { deactivateStaff } from '../../../services/staff'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'
import { idParamsSchema, validateParams } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const admin = await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)
  return deactivateStaff(useDb(), school, admin.id, id)
})

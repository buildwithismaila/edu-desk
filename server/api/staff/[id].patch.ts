import { defineEventHandler } from 'h3'
import { updateStaffSchema } from '../../../shared/schemas/staff'
import { updateStaff } from '../../services/staff'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { idParamsSchema, validateBody, validateParams } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const admin = await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)
  const changes = await validateBody(event, updateStaffSchema)
  return updateStaff(useDb(), school, admin.id, id, changes)
})

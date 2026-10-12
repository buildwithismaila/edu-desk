import { defineEventHandler } from 'h3'
import { removeStaff } from '../../services/staff'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { idParamsSchema, validateParams } from '../../utils/validation'

/** Admin: remove (soft-delete) a staff member who left. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const admin = await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)
  await removeStaff(useDb(), school, admin.id, id)
  return { removed: true }
})

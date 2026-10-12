import { defineEventHandler } from 'h3'
import { deleteDepartment } from '../../services/subjects'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { idParamsSchema, validateParams } from '../../utils/validation'

/** Admin: delete a department; 409 while subjects belong to it. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)
  await deleteDepartment(useDb(), school, id)
  return { deleted: true }
})

import { defineEventHandler } from 'h3'
import { deleteRegister } from '../../../services/attendance'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'
import { idParamsSchema, validateParams } from '../../../utils/validation'

/** Admin/principal: delete a register taken by mistake (e.g. on a holiday). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'principal'])
  const { id } = validateParams(event, idParamsSchema)
  await deleteRegister(useDb(), school, id)
  return { deleted: true }
})

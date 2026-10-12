import { defineEventHandler } from 'h3'
import { deleteClassLevel } from '../../services/classes'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { idParamsSchema, validateParams } from '../../utils/validation'

/** Admin: delete a class level; 409 while it has arms. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)
  await deleteClassLevel(useDb(), school, id)
  return { deleted: true }
})

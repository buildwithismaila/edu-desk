import { defineEventHandler } from 'h3'
import { deleteClassArm } from '../../services/classes'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { idParamsSchema, validateParams } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)
  await deleteClassArm(useDb(), school, id)
  return { deleted: true }
})

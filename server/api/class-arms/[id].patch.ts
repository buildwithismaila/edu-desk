import { defineEventHandler } from 'h3'
import { classArmSchema } from '../../../shared/schemas/classes'
import { renameClassArm } from '../../services/classes'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { idParamsSchema, validateBody, validateParams } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)
  const { name } = await validateBody(event, classArmSchema)
  return renameClassArm(useDb(), school, id, name)
})

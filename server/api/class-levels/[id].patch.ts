import { defineEventHandler } from 'h3'
import { renameClassLevelSchema } from '../../../shared/schemas/classes'
import { renameClassLevel } from '../../services/classes'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { idParamsSchema, validateBody, validateParams } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)
  const { name } = await validateBody(event, renameClassLevelSchema)
  return renameClassLevel(useDb(), school, id, name)
})

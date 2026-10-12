import { defineEventHandler } from 'h3'
import { updateGuardianSchema } from '../../../shared/schemas/students'
import { updateGuardian } from '../../services/guardians'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { idParamsSchema, validateBody, validateParams } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)
  const changes = await validateBody(event, updateGuardianSchema)
  return updateGuardian(useDb(), school, id, changes)
})

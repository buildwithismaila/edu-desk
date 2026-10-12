import { defineEventHandler } from 'h3'
import { subjectPatchSchema } from '../../../shared/schemas/subjects'
import { updateSubject } from '../../services/subjects'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { idParamsSchema, validateBody, validateParams } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)
  const changes = await validateBody(event, subjectPatchSchema)
  return updateSubject(useDb(), school, id, changes)
})

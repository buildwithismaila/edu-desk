import { defineEventHandler } from 'h3'
import { updateStudentSchema } from '../../../shared/schemas/students'
import { updateStudent } from '../../services/students'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { idParamsSchema, validateBody, validateParams } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)
  const changes = await validateBody(event, updateStudentSchema)
  return updateStudent(useDb(), school, id, changes)
})

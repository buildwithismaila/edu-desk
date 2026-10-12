import { defineEventHandler } from 'h3'
import { enrolmentSchema } from '../../../../shared/schemas/students'
import { setEnrolment } from '../../../services/students'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'
import { idParamsSchema, validateBody, validateParams } from '../../../utils/validation'

/** Admin: set or change the student's class arm for a session (default: current). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)
  const input = await validateBody(event, enrolmentSchema)
  return setEnrolment(useDb(), school, id, input)
})

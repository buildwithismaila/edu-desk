import { defineEventHandler, setResponseStatus } from 'h3'
import { studentGuardianSchema } from '../../../../../shared/schemas/students'
import { linkGuardian } from '../../../../services/guardians'
import { requireRole } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { requireTenant } from '../../../../utils/tenant'
import { idParamsSchema, validateBody, validateParams } from '../../../../utils/validation'

/** Admin: link an existing guardian or create a new one (with a one-time temporary password). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)
  const input = await validateBody(event, studentGuardianSchema)

  const result = await linkGuardian(useDb(), school, id, input)
  setResponseStatus(event, 201)
  return result
})

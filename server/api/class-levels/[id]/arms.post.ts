import { defineEventHandler, setResponseStatus } from 'h3'
import { classArmSchema } from '../../../../shared/schemas/classes'
import { createClassArm } from '../../../services/classes'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'
import { idParamsSchema, validateBody, validateParams } from '../../../utils/validation'

/** Admin: add an arm (e.g. A, Gold) to a class level. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)
  const { name } = await validateBody(event, classArmSchema)

  const arm = await createClassArm(useDb(), school, id, name)
  setResponseStatus(event, 201)
  return arm
})

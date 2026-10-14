import { defineEventHandler } from 'h3'
import { promoteArmSchema, promotionArmParamsSchema } from '../../../shared/schemas/promotion'
import { promoteArm } from '../../services/promotion'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateBody, validateParams } from '../../utils/validation'

/** Admin: promote the arm into the next session (once per arm and session). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const admin = await requireRole(event, ['admin'])
  const { armId } = validateParams(event, promotionArmParamsSchema)
  return promoteArm(useDb(), school, admin, armId, await validateBody(event, promoteArmSchema))
})

import { defineEventHandler } from 'h3'
import { promotionArmParamsSchema } from '../../../shared/schemas/promotion'
import { getArmPromotion } from '../../services/promotion'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateParams } from '../../utils/validation'

/** Admin: an arm's students with default (or recorded) outcomes and target arms. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { armId } = validateParams(event, promotionArmParamsSchema)
  return getArmPromotion(useDb(), school, armId)
})

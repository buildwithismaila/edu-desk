import { defineEventHandler } from 'h3'
import { promotionArmParamsSchema } from '../../../shared/schemas/promotion'
import { undoArmPromotion } from '../../services/promotion'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateParams } from '../../utils/validation'

/** Admin: undo the arm's promotion while the next session isn't current. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { armId } = validateParams(event, promotionArmParamsSchema)
  return undoArmPromotion(useDb(), school, armId)
})

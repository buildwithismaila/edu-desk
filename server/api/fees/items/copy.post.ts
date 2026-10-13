import { defineEventHandler } from 'h3'
import { copyFeeItemsSchema } from '../../../../shared/schemas/fees'
import { copyFeeItems } from '../../../services/fees'
import { validateBody } from '../../../utils/validation'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'

/** Copy every level's fee items from one term to another (which has none yet). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'bursar'])
  return copyFeeItems(useDb(), school, await validateBody(event, copyFeeItemsSchema))
})

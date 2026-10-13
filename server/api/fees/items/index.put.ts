import { defineEventHandler } from 'h3'
import { feeItemsSchema } from '../../../../shared/schemas/fees'
import { replaceFeeItems } from '../../../services/fees'
import { validateBody } from '../../../utils/validation'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'

/** Replace one class level's fee items for a term. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'bursar'])
  return replaceFeeItems(useDb(), school, await validateBody(event, feeItemsSchema))
})

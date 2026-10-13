import { defineEventHandler } from 'h3'
import { feeTermQuerySchema } from '../../../../shared/schemas/fees'
import { listFeeItems } from '../../../services/fees'
import { validateQuery } from '../../../utils/validation'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'

/** Fee items per class level for the term (default current). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'bursar', 'principal'])
  return listFeeItems(useDb(), school, validateQuery(event, feeTermQuerySchema).termId)
})

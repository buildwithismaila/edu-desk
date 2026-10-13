import { defineEventHandler } from 'h3'
import { feeTermQuerySchema } from '../../../shared/schemas/fees'
import { collections } from '../../services/payments'
import { validateQuery } from '../../utils/validation'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'

/** The term's collections: expected vs collected, by level, method and day. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'bursar', 'principal'])
  return collections(useDb(), school, validateQuery(event, feeTermQuerySchema))
})

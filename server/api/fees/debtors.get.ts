import { defineEventHandler } from 'h3'
import { feeTermQuerySchema } from '../../../shared/schemas/fees'
import { debtors } from '../../services/payments'
import { validateQuery } from '../../utils/validation'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'

/** Students who owe for the term (an arm or the school), largest first. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'bursar', 'principal'])
  return debtors(useDb(), school, validateQuery(event, feeTermQuerySchema))
})

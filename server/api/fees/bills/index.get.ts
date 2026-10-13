import { defineEventHandler } from 'h3'
import { billsQuerySchema } from '../../../../shared/schemas/fees'
import { listBills } from '../../../services/fees'
import { validateQuery } from '../../../utils/validation'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'

/** Bills for the term with billed, paid and balance (paginated, searchable). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'bursar', 'principal'])
  return listBills(useDb(), school, validateQuery(event, billsQuerySchema))
})

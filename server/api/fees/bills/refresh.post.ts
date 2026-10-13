import { defineEventHandler } from 'h3'
import { billsActionSchema } from '../../../../shared/schemas/fees'
import { refreshBills } from '../../../services/fees'
import { validateBody } from '../../../utils/validation'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'

/** Re-sync bills with fee items (bills without payments) and carry-forward lines (all). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'bursar'])
  return refreshBills(useDb(), school, await validateBody(event, billsActionSchema))
})

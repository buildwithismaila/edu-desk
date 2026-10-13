import { defineEventHandler } from 'h3'
import { billsActionSchema } from '../../../../shared/schemas/fees'
import { generateBills } from '../../../services/fees'
import { validateBody } from '../../../utils/validation'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'

/** Create the missing bills for the term (the school or one arm). Running it again creates nothing new. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'bursar'])
  return generateBills(useDb(), school, user, await validateBody(event, billsActionSchema))
})

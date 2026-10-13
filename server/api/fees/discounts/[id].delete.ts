import { defineEventHandler } from 'h3'
import { billDetails, removeDiscount } from '../../../services/fees'
import { idParamsSchema, validateParams } from '../../../utils/validation'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'

/** Remove a discount (discounts aren't money received; payments can only be reversed). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'bursar'])
  const { id } = validateParams(event, idParamsSchema)
  const db = useDb()
  const { billId } = await removeDiscount(db, school, id)
  return billDetails(db, school, billId)
})

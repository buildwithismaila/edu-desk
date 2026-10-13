import { defineEventHandler } from 'h3'
import { childPaymentParamsSchema } from '../../../../../../shared/schemas/parent'
import { childReceipt, requireOwnChild } from '../../../../../services/parent-portal'
import { requireRole } from '../../../../../utils/auth'
import { useDb } from '../../../../../utils/db'
import { requireTenant } from '../../../../../utils/tenant'
import { validateParams } from '../../../../../utils/validation'

/** Parent: the receipt for a payment on their child's bills. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const parent = await requireRole(event, ['parent'])
  const params = validateParams(event, childPaymentParamsSchema)

  const db = useDb()
  const child = await requireOwnChild(db, school, parent, params.id)
  return childReceipt(db, school, child, params.paymentId)
})

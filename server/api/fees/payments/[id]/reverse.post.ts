import { defineEventHandler } from 'h3'
import { reverseSchema } from '../../../../../shared/schemas/fees'
import { reversePayment } from '../../../../services/payments'
import { idParamsSchema, validateBody, validateParams } from '../../../../utils/validation'
import { requireRole } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { requireTenant } from '../../../../utils/tenant'

/** Reverse a payment once, with a reason (payments are never edited or deleted). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'bursar'])
  const { id } = validateParams(event, idParamsSchema)
  const { reason } = await validateBody(event, reverseSchema)
  return reversePayment(useDb(), school, user, id, reason)
})

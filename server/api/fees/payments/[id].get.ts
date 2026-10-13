import { defineEventHandler } from 'h3'
import { getPayment } from '../../../services/payments'
import { idParamsSchema, validateParams } from '../../../utils/validation'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'

/** A payment's receipt data. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'bursar', 'principal'])
  const { id } = validateParams(event, idParamsSchema)
  return getPayment(useDb(), school, id)
})

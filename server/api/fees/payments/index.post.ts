import { defineEventHandler, setResponseStatus } from 'h3'
import { paymentSchema } from '../../../../shared/schemas/fees'
import { SCHOOL_TIME_ZONE, todayIn } from '../../../../shared/utils/dates'
import { recordPayment } from '../../../services/payments'
import { validateBody } from '../../../utils/validation'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'

/** Record money received against a bill: 201 with the receipt (number from the per-year counter). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'bursar'])
  const payment = await recordPayment(useDb(), school, user, await validateBody(event, paymentSchema), todayIn(SCHOOL_TIME_ZONE))
  setResponseStatus(event, 201)
  return payment
})

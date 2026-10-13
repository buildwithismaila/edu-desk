import { defineEventHandler } from 'h3'
import { feeTermQuerySchema } from '../../../../shared/schemas/fees'
import { studentFees } from '../../../services/payments'
import { idParamsSchema, validateParams, validateQuery } from '../../../utils/validation'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'

/** A student's bill for the term (default current) and their ledger across terms. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'bursar', 'principal'])
  const { id } = validateParams(event, idParamsSchema)
  return studentFees(useDb(), school, id, validateQuery(event, feeTermQuerySchema).termId)
})

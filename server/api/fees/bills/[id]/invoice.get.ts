import { defineEventHandler } from 'h3'
import { billInvoice } from '../../../../services/invoices'
import { requireRole } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { requireTenant } from '../../../../utils/tenant'
import { idParamsSchema, validateParams } from '../../../../utils/validation'

/** A bill's printable invoice, with the school's bank accounts. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'bursar', 'principal'])
  const { id } = validateParams(event, idParamsSchema)
  return billInvoice(useDb(), school, id)
})

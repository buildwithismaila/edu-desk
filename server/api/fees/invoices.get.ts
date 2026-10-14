import { defineEventHandler } from 'h3'
import { z } from 'zod'
import { classInvoices } from '../../services/invoices'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateQuery } from '../../utils/validation'

const querySchema = z.object({ termId: z.uuid().optional(), classArmId: z.uuid('Choose a class') })

/** Invoices for every billed student in a class (one per printed page). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'bursar', 'principal'])
  return classInvoices(useDb(), school, validateQuery(event, querySchema))
})

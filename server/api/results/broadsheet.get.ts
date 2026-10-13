import { defineEventHandler } from 'h3'
import { resultsQuerySchema } from '../../../shared/schemas/results'
import { getBroadsheet } from '../../services/results'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateQuery } from '../../utils/validation'

/** The class broadsheet: subject totals, total, average and position per student, with subject stats. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'principal', 'teacher'])
  return getBroadsheet(useDb(), school, user, validateQuery(event, resultsQuerySchema))
})

import { defineEventHandler } from 'h3'
import { resultsQuerySchema } from '../../../shared/schemas/results'
import { getArmResults } from '../../services/results'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateQuery } from '../../utils/validation'

/** An arm's results for a term: status, completeness and ranked students. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'principal', 'teacher'])
  return getArmResults(useDb(), school, user, validateQuery(event, resultsQuerySchema))
})

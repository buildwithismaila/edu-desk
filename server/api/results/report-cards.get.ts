import { defineEventHandler } from 'h3'
import { reportCardsQuerySchema } from '../../../shared/schemas/results'
import { getReportCards } from '../../services/results'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateQuery } from '../../utils/validation'

/** The arm's report cards (or one student's): frozen once published, live before. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'principal', 'teacher'])
  return getReportCards(useDb(), school, user, validateQuery(event, reportCardsQuerySchema))
})

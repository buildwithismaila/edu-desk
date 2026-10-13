import { defineEventHandler } from 'h3'
import { resultsActionSchema } from '../../../shared/schemas/results'
import { transitionArmResults } from '../../services/results'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateBody } from '../../utils/validation'

/** Draft → Submitted (class teacher, admin, principal). Needs complete sheets; locks the scores. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'principal', 'teacher'])
  return transitionArmResults(useDb(), school, user, await validateBody(event, resultsActionSchema), 'submit')
})

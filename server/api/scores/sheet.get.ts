import { defineEventHandler } from 'h3'
import { sheetQuerySchema } from '../../../shared/schemas/scores'
import { getScoreSheet } from '../../services/scores'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateQuery } from '../../utils/validation'

/** One score sheet (term, arm, subject): admin, principal or the assigned subject teacher. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'principal', 'teacher'])
  return getScoreSheet(useDb(), school, user, validateQuery(event, sheetQuerySchema))
})

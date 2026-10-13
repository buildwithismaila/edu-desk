import { defineEventHandler } from 'h3'
import { saveRatingsSchema } from '../../../shared/schemas/scores'
import { saveRatingsSheet } from '../../services/ratings'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateBody } from '../../utils/validation'

/** Save trait ratings and comments in one transaction (409 when the arm is locked). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'principal', 'teacher'])
  return saveRatingsSheet(useDb(), school, user, await validateBody(event, saveRatingsSchema))
})

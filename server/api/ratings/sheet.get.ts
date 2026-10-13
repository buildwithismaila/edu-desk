import { defineEventHandler } from 'h3'
import { ratingsQuerySchema } from '../../../shared/schemas/scores'
import { getRatingsSheet } from '../../services/ratings'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateQuery } from '../../utils/validation'

/** Trait ratings and class teacher's comments for an arm: admin, principal or the class teacher. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'principal', 'teacher'])
  return getRatingsSheet(useDb(), school, user, validateQuery(event, ratingsQuerySchema))
})

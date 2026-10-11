import { defineEventHandler } from 'h3'
import { getCurrentTerm } from '../../services/calendar'
import { requireUser } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'

/** Any logged-in user (including parents): the school's current session and term. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireUser(event)
  return getCurrentTerm(useDb(), school)
})

import { defineEventHandler } from 'h3'
import { parentLoginsQuerySchema } from '../../../shared/schemas/parent-logins'
import { listParentLogins } from '../../services/parent-logins'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateQuery } from '../../utils/validation'

/** Admin: parents with their children and login status. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  return listParentLogins(useDb(), school, validateQuery(event, parentLoginsQuerySchema))
})

import { defineEventHandler } from 'h3'
import { generateParentLoginsSchema } from '../../../shared/schemas/parent-logins'
import { generateParentLogins } from '../../services/parent-logins'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateBody } from '../../utils/validation'

/** Admin: one-time passwords for parents, returned once for the login slips. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  return generateParentLogins(useDb(), school, await validateBody(event, generateParentLoginsSchema))
})

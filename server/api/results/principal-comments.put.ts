import { defineEventHandler } from 'h3'
import { principalCommentsSchema } from '../../../shared/schemas/results'
import { savePrincipalComments } from '../../services/results'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateBody } from '../../utils/validation'

/** Admin/principal: principal's comments for an arm's students (not once published). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'principal'])
  return savePrincipalComments(useDb(), school, user, await validateBody(event, principalCommentsSchema))
})

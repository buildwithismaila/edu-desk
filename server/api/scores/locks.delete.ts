import { defineEventHandler } from 'h3'
import { scoreLockSchema } from '../../../shared/schemas/scores'
import { setScoreLock } from '../../services/scores'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateBody } from '../../utils/validation'

/** Admin/principal: unlock an arm's scores for a term. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'principal'])
  return setScoreLock(useDb(), school, user, await validateBody(event, scoreLockSchema), false)
})

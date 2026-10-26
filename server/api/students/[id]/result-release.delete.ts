import { defineEventHandler } from 'h3'
import { resultReleaseQuerySchema } from '../../../../shared/schemas/results'
import { withholdResultAgain } from '../../../services/result-holds'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'
import { idParamsSchema, validateParams, validateQuery } from '../../../utils/validation'

/** Admin or bursar: withhold a released result again while fees are owed (Phase 10d). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'bursar'])
  const { id } = validateParams(event, idParamsSchema)
  const { termId } = validateQuery(event, resultReleaseQuerySchema)
  await withholdResultAgain(useDb(), school, id, termId)
  return { released: false }
})

import { defineEventHandler } from 'h3'
import { resultReleaseQuerySchema } from '../../../../shared/schemas/results'
import { releaseResult } from '../../../services/result-holds'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'
import { idParamsSchema, validateParams, validateQuery } from '../../../utils/validation'

/** Admin or bursar: show a term's result to the parents although fees are owed (Phase 10d). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const viewer = await requireRole(event, ['admin', 'bursar'])
  const { id } = validateParams(event, idParamsSchema)
  const { termId } = validateQuery(event, resultReleaseQuerySchema)
  await releaseResult(useDb(), school, viewer, id, termId)
  return { released: true }
})

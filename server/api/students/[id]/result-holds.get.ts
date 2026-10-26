import { defineEventHandler } from 'h3'
import { resultHolds } from '../../../services/result-holds'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'
import { idParamsSchema, validateParams } from '../../../utils/validation'

/** Admin or bursar: the student's results withheld from parents for unpaid fees, or released anyway (Phase 10d). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'bursar'])
  const { id } = validateParams(event, idParamsSchema)
  return resultHolds(useDb(), school, id)
})

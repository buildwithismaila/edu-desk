import { defineEventHandler } from 'h3'
import { listScoreSheets } from '../../services/scores'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'

/** My score sheets for the current term, with progress (teachers: assigned pairs; admin/principal: all). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'principal', 'teacher'])
  return listScoreSheets(useDb(), school, user)
})

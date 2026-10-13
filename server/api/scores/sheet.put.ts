import { defineEventHandler } from 'h3'
import { saveSheetSchema } from '../../../shared/schemas/scores'
import { saveScoreSheet } from '../../services/scores'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateBody } from '../../utils/validation'

/** Save changed cells of a sheet in one transaction (400 with cellErrors, 409 when locked). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'principal', 'teacher'])
  return saveScoreSheet(useDb(), school, user, await validateBody(event, saveSheetSchema))
})

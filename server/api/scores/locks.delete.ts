import { defineEventHandler } from 'h3'
import { scoreLockSchema } from '../../../shared/schemas/scores'
import { resultsHoldLock } from '../../services/results'
import { setScoreLock } from '../../services/scores'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { conflict } from '../../utils/errors'
import { requireTenant } from '../../utils/tenant'
import { validateBody } from '../../utils/validation'

/** Admin/principal: unlock an arm's scores for a term. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'principal'])
  const input = await validateBody(event, scoreLockSchema)
  const db = useDb()
  // Submitted or published results hold the lock: go back to draft instead
  if (await resultsHoldLock(db, school, input.termId, input.classArmId)) {
    throw conflict('These results are submitted or published. Return them to draft first.')
  }
  return setScoreLock(db, school, user, input, false)
})

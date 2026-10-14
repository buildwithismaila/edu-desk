import { defineEventHandler } from 'h3'
import { listPromotionArms } from '../../services/promotion'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'

/** Admin: this session → next session, and every arm with its promotion state. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  return listPromotionArms(useDb(), school)
})

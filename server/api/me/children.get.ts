import { defineEventHandler } from 'h3'
import { listMyChildren } from '../../services/guardians'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'

/** Parent: their own children ("My children"). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const parent = await requireRole(event, ['parent'])
  return listMyChildren(useDb(), school, parent.id)
})

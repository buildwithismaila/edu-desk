import { defineEventHandler } from 'h3'
import { myChildren } from '../../../services/parent-portal'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'

/** Parent: their own children ("My children"), with this term's attendance, fees and latest report card. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const parent = await requireRole(event, ['parent'])
  return myChildren(useDb(), school, parent)
})

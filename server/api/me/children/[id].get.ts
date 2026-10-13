import { defineEventHandler } from 'h3'
import { childOverview, requireOwnChild } from '../../../services/parent-portal'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'
import { idParamsSchema, validateParams } from '../../../utils/validation'

/** Parent: their child's page header and the terms for the pickers (404 unless it's their own child). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const parent = await requireRole(event, ['parent'])
  const params = validateParams(event, idParamsSchema)

  const db = useDb()
  const child = await requireOwnChild(db, school, parent, params.id)
  return childOverview(db, school, child)
})

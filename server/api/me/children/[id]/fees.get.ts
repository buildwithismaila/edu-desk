import { defineEventHandler } from 'h3'
import { childTermQuerySchema } from '../../../../../shared/schemas/parent'
import { childFees, requireOwnChild } from '../../../../services/parent-portal'
import { requireRole } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { requireTenant } from '../../../../utils/tenant'
import { idParamsSchema, validateParams, validateQuery } from '../../../../utils/validation'

/** Parent: their child's bill for a term (default the current term), read-only. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const parent = await requireRole(event, ['parent'])
  const params = validateParams(event, idParamsSchema)
  const { termId } = validateQuery(event, childTermQuerySchema)
  const db = useDb()
  const child = await requireOwnChild(db, school, parent, params.id)
  return childFees(db, school, child, termId)
})

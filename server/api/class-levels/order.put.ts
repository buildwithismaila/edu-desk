import { defineEventHandler } from 'h3'
import { classLevelOrderSchema } from '../../../shared/schemas/classes'
import { reorderClassLevels } from '../../services/classes'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateBody } from '../../utils/validation'

/** Admin: new order for all of the school's class levels. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { ids } = await validateBody(event, classLevelOrderSchema)
  return reorderClassLevels(useDb(), school, ids)
})

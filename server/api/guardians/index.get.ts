import { defineEventHandler } from 'h3'
import { guardianSearchSchema } from '../../../shared/schemas/students'
import { searchGuardians } from '../../services/guardians'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateQuery } from '../../utils/validation'

/** Admin: find guardians by name or phone (e.g. to link a sibling's parent). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { search } = validateQuery(event, guardianSearchSchema)
  return searchGuardians(useDb(), school, search)
})

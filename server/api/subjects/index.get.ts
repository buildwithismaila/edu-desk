import { defineEventHandler } from 'h3'
import { STAFF_ROLES } from '../../../shared/constants/roles'
import { subjectsQuerySchema } from '../../../shared/schemas/subjects'
import { listSubjects } from '../../services/subjects'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateQuery } from '../../utils/validation'

/** Staff: subjects, optionally `?section=`. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, STAFF_ROLES)
  const { section } = validateQuery(event, subjectsQuerySchema)
  return listSubjects(useDb(), school, section)
})

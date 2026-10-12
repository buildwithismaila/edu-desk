import { defineEventHandler } from 'h3'
import { studentListQuerySchema } from '../../../shared/schemas/students'
import { listStudents } from '../../services/students'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateQuery } from '../../utils/validation'

/** Staff: paginated student list; teachers only see students in their arms. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const viewer = await requireRole(event, ['admin', 'principal', 'bursar', 'teacher'])
  const query = validateQuery(event, studentListQuerySchema)
  return listStudents(useDb(), school, viewer, query)
})

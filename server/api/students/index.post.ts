import { defineEventHandler, setResponseStatus } from 'h3'
import { admitStudentSchema } from '../../../shared/schemas/students'
import { admitStudent } from '../../services/students'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateBody } from '../../utils/validation'

/** Admin: admit a student (one transaction); returns new guardians' one-time temporary passwords. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const input = await validateBody(event, admitStudentSchema)

  const result = await admitStudent(useDb(), school, input)
  setResponseStatus(event, 201)
  return result
})

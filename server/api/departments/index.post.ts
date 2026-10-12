import { defineEventHandler, setResponseStatus } from 'h3'
import { departmentSchema } from '../../../shared/schemas/subjects'
import { createDepartment } from '../../services/subjects'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateBody } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { name } = await validateBody(event, departmentSchema)

  const department = await createDepartment(useDb(), school, name)
  setResponseStatus(event, 201)
  return department
})

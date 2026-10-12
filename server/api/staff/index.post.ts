import { defineEventHandler, setResponseStatus } from 'h3'
import { createStaffSchema } from '../../../shared/schemas/staff'
import { createStaff } from '../../services/staff'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateBody } from '../../utils/validation'

/** Admin: add staff; returns a one-time temporary password (they must change it at first login). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const input = await validateBody(event, createStaffSchema)

  const created = await createStaff(useDb(), school, input)
  setResponseStatus(event, 201)
  return created
})

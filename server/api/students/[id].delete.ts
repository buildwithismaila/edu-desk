import { defineEventHandler } from 'h3'
import { removeStudent } from '../../services/students'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { idParamsSchema, validateParams } from '../../utils/validation'

/** Admin: remove (soft-delete) a student who left. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)
  await removeStudent(useDb(), school, id)
  return { removed: true }
})

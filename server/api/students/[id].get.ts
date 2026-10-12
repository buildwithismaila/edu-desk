import { defineEventHandler } from 'h3'
import { assertCanSeeStudent, getStudent } from '../../services/students'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { idParamsSchema, validateParams } from '../../utils/validation'

/** Staff: a student's profile (teachers: only their arms; bursar: without personal details). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const viewer = await requireRole(event, ['admin', 'principal', 'bursar', 'teacher'])
  const { id } = validateParams(event, idParamsSchema)

  const db = useDb()
  await assertCanSeeStudent(db, school, viewer, id)
  return getStudent(db, school, id, viewer.role)
})

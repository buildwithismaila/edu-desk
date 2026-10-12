import { defineEventHandler } from 'h3'
import { studentAttendanceQuerySchema } from '../../../../shared/schemas/attendance'
import { studentAttendanceSummary } from '../../../services/attendance'
import { assertCanSeeStudent } from '../../../services/students'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'
import { idParamsSchema, validateParams, validateQuery } from '../../../utils/validation'

/** A student's term attendance: staff who can see the student, except the bursar (nothing academic). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const viewer = await requireRole(event, ['admin', 'principal', 'teacher'])
  const { id } = validateParams(event, idParamsSchema)
  const { termId } = validateQuery(event, studentAttendanceQuerySchema)

  const db = useDb()
  await assertCanSeeStudent(db, school, viewer, id)
  return studentAttendanceSummary(db, school, id, termId)
})

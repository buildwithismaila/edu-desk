import { defineEventHandler } from 'h3'
import { studentReportCardQuerySchema } from '../../../../shared/schemas/results'
import { getStudentReportCard } from '../../../services/results'
import { assertCanSeeStudent } from '../../../services/students'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'
import { idParamsSchema, validateParams, validateQuery } from '../../../utils/validation'

/** One report card: parents for their own child once published; staff who can see the arm's results. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const viewer = await requireRole(event, ['admin', 'principal', 'teacher', 'parent'])
  const { id } = validateParams(event, idParamsSchema)
  const { termId } = validateQuery(event, studentReportCardQuerySchema)

  const db = useDb()
  // Another family's child (or a student outside a teacher's classes) is "not found"
  await assertCanSeeStudent(db, school, viewer, id)
  return getStudentReportCard(db, school, viewer, id, termId)
})

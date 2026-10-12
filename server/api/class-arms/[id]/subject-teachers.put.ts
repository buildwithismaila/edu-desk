import { defineEventHandler } from 'h3'
import { subjectTeachersSchema } from '../../../../shared/schemas/assignments'
import { requireSession, setSubjectTeachers } from '../../../services/assignments'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'
import { idParamsSchema, validateBody, validateParams } from '../../../utils/validation'

/** Admin, principal: set or clear the teachers of the listed subjects in this arm for a session. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'principal'])
  const { id } = validateParams(event, idParamsSchema)
  const { sessionId, assignments } = await validateBody(event, subjectTeachersSchema)

  const db = useDb()
  const session = await requireSession(db, school, sessionId)
  return setSubjectTeachers(db, school, session.id, id, assignments)
})

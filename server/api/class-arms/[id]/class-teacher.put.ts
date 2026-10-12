import { defineEventHandler } from 'h3'
import { classTeacherSchema } from '../../../../shared/schemas/assignments'
import { requireSession, setClassTeacher } from '../../../services/assignments'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { requireTenant } from '../../../utils/tenant'
import { idParamsSchema, validateBody, validateParams } from '../../../utils/validation'

/** Admin, principal: set or clear (userId null) the arm's class teacher for a session. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'principal'])
  const { id } = validateParams(event, idParamsSchema)
  const { sessionId, userId } = await validateBody(event, classTeacherSchema)

  const db = useDb()
  const session = await requireSession(db, school, sessionId)
  return setClassTeacher(db, school, session.id, id, userId)
})

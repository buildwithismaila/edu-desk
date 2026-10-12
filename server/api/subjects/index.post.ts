import { defineEventHandler, setResponseStatus } from 'h3'
import { subjectSchema } from '../../../shared/schemas/subjects'
import { createSubject } from '../../services/subjects'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateBody } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const values = await validateBody(event, subjectSchema)

  const subject = await createSubject(useDb(), school, values)
  setResponseStatus(event, 201)
  return subject
})

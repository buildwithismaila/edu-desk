import { defineEventHandler, setResponseStatus } from 'h3'
import { createClassLevelSchema } from '../../../shared/schemas/classes'
import { createClassLevel } from '../../services/classes'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateBody } from '../../utils/validation'

/** Admin: add a class level at the end of its section. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const input = await validateBody(event, createClassLevelSchema)

  const level = await createClassLevel(useDb(), school, input)
  setResponseStatus(event, 201)
  return level
})

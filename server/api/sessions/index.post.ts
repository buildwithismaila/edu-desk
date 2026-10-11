import { defineEventHandler, setResponseStatus } from 'h3'
import { z } from 'zod'
import { sessionNameSchema } from '../../../shared/schemas/academics'
import { createSessionWithTerms } from '../../services/calendar'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { conflict, isUniqueViolation } from '../../utils/errors'
import { requireTenant } from '../../utils/tenant'
import { validateBody } from '../../utils/validation'

/** Admin: a new session with its three terms. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { name } = await validateBody(event, z.object({ name: sessionNameSchema }))

  try {
    const session = await createSessionWithTerms(useDb(), school, name)
    setResponseStatus(event, 201)
    return session
  }
  catch (error) {
    if (isUniqueViolation(error)) throw conflict(`Session ${name} already exists`)
    throw error
  }
})

import { defineEventHandler } from 'h3'
import { getCurrentTerm, setCurrentTerm } from '../../../services/calendar'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { notFound } from '../../../utils/errors'
import { requireTenant } from '../../../utils/tenant'
import { idParamsSchema, validateParams } from '../../../utils/validation'

/** Admin: make this term (and its session) current; the previous ones stop being current. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)

  const db = useDb()
  if (!await setCurrentTerm(db, school, id)) throw notFound('Term not found')
  return getCurrentTerm(db, school)
})

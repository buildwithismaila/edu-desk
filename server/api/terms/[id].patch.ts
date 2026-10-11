import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { termDatesSchema } from '../../../shared/schemas/academics'
import { terms } from '../../database/schema'
import { toTermDto } from '../../services/calendar'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { notFound } from '../../utils/errors'
import { requireTenant, whereSchool } from '../../utils/tenant'
import { assertValid, idParamsSchema, validateBody, validateParams } from '../../utils/validation'

/** Admin: set or clear a term's dates. The rules apply to the result, not just the fields sent. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)
  const changes = await validateBody(event, termDatesSchema)

  const db = useDb()
  const byId = whereSchool(terms, school, eq(terms.id, id))
  const [term] = await db.select().from(terms).where(byId)
  if (!term) throw notFound('Term not found')

  const dates = assertValid(termDatesSchema, {
    startsOn: term.startsOn,
    endsOn: term.endsOn,
    nextTermBeginsOn: term.nextTermBeginsOn,
    ...changes,
  })
  const [updated] = await db.update(terms).set(dates).where(byId).returning()
  return toTermDto(updated!)
})

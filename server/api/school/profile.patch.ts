import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { schoolProfileSchema } from '../../../shared/schemas/school'
import { schools } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { toSchoolProfile } from '../../utils/school'
import { forgetTenantSchool, requireTenant } from '../../utils/tenant'
import { validateBody } from '../../utils/validation'

/** Admin: partial update of the profile (not the logo). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const changes = await validateBody(event, schoolProfileSchema)

  const db = useDb()
  const [row] = Object.keys(changes).length
    ? await db.update(schools).set(changes).where(eq(schools.id, school.id)).returning()
    : await db.select().from(schools).where(eq(schools.id, school.id))

  // The tenant cache holds the name; drop it so the new name shows at once
  if (changes.name) forgetTenantSchool(school.slug)
  return toSchoolProfile(row!)
})

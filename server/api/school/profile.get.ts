import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { STAFF_ROLES } from '../../../shared/constants/roles'
import { schools } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { toSchoolProfile } from '../../utils/school'
import { requireTenant } from '../../utils/tenant'

export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, STAFF_ROLES)

  const [row] = await useDb().select().from(schools).where(eq(schools.id, school.id))
  return toSchoolProfile(row!)
})

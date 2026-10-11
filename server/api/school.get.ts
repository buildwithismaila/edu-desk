import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { schools } from '../database/schema'
import { useDb } from '../utils/db'
import { schoolLogoUrl } from '../utils/school'
import { requireTenant } from '../utils/tenant'

/** Public school identity for the layout and login page. Never exposes id or status. */
export default defineEventHandler(async (event) => {
  const { id, slug, name } = requireTenant(event)
  const [logo] = await useDb()
    .select({ logoKey: schools.logoKey, logoUpdatedAt: schools.logoUpdatedAt })
    .from(schools)
    .where(eq(schools.id, id))
  return { slug, name, logoUrl: logo ? schoolLogoUrl(logo) : null }
})

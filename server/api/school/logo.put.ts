import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { schools } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { readImageUpload } from '../../utils/image'
import { schoolLogoUrl, uploadsStorage } from '../../utils/school'
import { requireTenant } from '../../utils/tenant'

/** Admin: upload or replace the logo (multipart field `logo`). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { data, type } = await readImageUpload(event, 'logo')

  const db = useDb()
  const [current] = await db.select({ logoKey: schools.logoKey }).from(schools).where(eq(schools.id, school.id))
  const key = `schools/${school.id}/logo.${type}`
  const storage = uploadsStorage()
  await storage.setItemRaw(key, data)
  if (current?.logoKey && current.logoKey !== key) await storage.removeItem(current.logoKey)

  const [row] = await db.update(schools).set({ logoKey: key, logoUpdatedAt: new Date() }).where(eq(schools.id, school.id)).returning()
  return { logoUrl: schoolLogoUrl(row!) }
})

import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { schools } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { uploadsStorage } from '../../utils/school'
import { requireTenant } from '../../utils/tenant'

/** Admin: remove the logo (idempotent). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])

  const db = useDb()
  const [row] = await db.select({ logoKey: schools.logoKey }).from(schools).where(eq(schools.id, school.id))
  if (row?.logoKey) await uploadsStorage().removeItem(row.logoKey)
  await db.update(schools).set({ logoKey: null, logoUpdatedAt: null }).where(eq(schools.id, school.id))
  return { logoUrl: null }
})

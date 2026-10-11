import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRequestHeader, readMultipartFormData } from 'h3'
import { LOGO_MAX_BYTES } from '../../../shared/schemas/school'
import { schools } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { detectImageType } from '../../utils/image'
import { schoolLogoUrl, uploadsStorage } from '../../utils/school'
import { requireTenant } from '../../utils/tenant'
import { fieldError } from '../../utils/validation'

const tooLarge = () => createError({ statusCode: 413, statusMessage: 'Payload Too Large', message: 'The logo must be 1 MB or smaller' })

/** Admin: upload or replace the logo (multipart field `logo`). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])

  // Refuse obviously oversized bodies before reading them (multipart overhead allowed)
  if (Number(getRequestHeader(event, 'content-length') ?? 0) > LOGO_MAX_BYTES + 64 * 1024) throw tooLarge()

  const file = (await readMultipartFormData(event))?.find(part => part.name === 'logo')
  if (!file?.data.length) throw fieldError('logo', 'Choose an image to upload')
  if (file.data.length > LOGO_MAX_BYTES) throw tooLarge()

  const type = detectImageType(file.data)
  if (!type) throw fieldError('logo', 'Upload a PNG, JPEG or WebP image')

  const db = useDb()
  const [current] = await db.select({ logoKey: schools.logoKey }).from(schools).where(eq(schools.id, school.id))
  const key = `schools/${school.id}/logo.${type}`
  const storage = uploadsStorage()
  await storage.setItemRaw(key, file.data)
  if (current?.logoKey && current.logoKey !== key) await storage.removeItem(current.logoKey)

  const [row] = await db.update(schools).set({ logoKey: key, logoUpdatedAt: new Date() }).where(eq(schools.id, school.id)).returning()
  return { logoUrl: schoolLogoUrl(row!) }
})

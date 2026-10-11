import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, setResponseHeaders } from 'h3'
import { schools } from '../../database/schema'
import { useDb } from '../../utils/db'
import { IMAGE_CONTENT_TYPES, type ImageType } from '../../utils/image'
import { uploadsStorage } from '../../utils/school'
import { requireTenant } from '../../utils/tenant'

const notFound = () => createError({ statusCode: 404, statusMessage: 'Not Found', message: 'No logo' })

/** Public: the host school's logo. The key comes from the DB row of the tenant, never from input. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const [row] = await useDb().select({ logoKey: schools.logoKey }).from(schools).where(eq(schools.id, school.id))
  if (!row?.logoKey) throw notFound()

  const data = await uploadsStorage().getItemRaw<Uint8Array>(row.logoKey)
  if (!data) throw notFound()

  const type = row.logoKey.split('.').pop() as ImageType
  setResponseHeaders(event, {
    'content-type': IMAGE_CONTENT_TYPES[type],
    'cache-control': 'public, max-age=86400',
    'x-content-type-options': 'nosniff',
  })
  return data
})

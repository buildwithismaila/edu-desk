import { eq } from 'drizzle-orm'
import { defineEventHandler, setResponseHeaders } from 'h3'
import { students } from '../../../database/schema'
import { assertCanSeeStudent } from '../../../services/students'
import { requireUser } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { notFound } from '../../../utils/errors'
import { IMAGE_CONTENT_TYPES, type ImageType } from '../../../utils/image'
import { readUpload } from '../../../utils/school'
import { requireTenant, whereSchool } from '../../../utils/tenant'
import { idParamsSchema, validateParams } from '../../../utils/validation'

/** Private photo: only users who may see the student (staff by role/arms, the student's guardians). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const viewer = await requireUser(event)
  const { id } = validateParams(event, idParamsSchema)

  const db = useDb()
  await assertCanSeeStudent(db, school, viewer, id)
  const [row] = await db.select({ photoKey: students.photoKey }).from(students).where(whereSchool(students, school, eq(students.id, id)))
  const data = row?.photoKey ? await readUpload(row.photoKey) : null
  if (!row?.photoKey || !data) throw notFound('No photo')

  setResponseHeaders(event, {
    'content-type': IMAGE_CONTENT_TYPES[row.photoKey.split('.').pop() as ImageType],
    'cache-control': 'private, max-age=3600',
    'x-content-type-options': 'nosniff',
  })
  return data
})

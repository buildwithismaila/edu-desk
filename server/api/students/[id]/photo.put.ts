import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { students } from '../../../database/schema'
import { studentPhotoUrl } from '../../../services/guardians'
import { getStudent } from '../../../services/students'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { readImageUpload } from '../../../utils/image'
import { uploadsStorage } from '../../../utils/school'
import { requireTenant, whereSchool } from '../../../utils/tenant'
import { idParamsSchema, validateParams } from '../../../utils/validation'

/** Admin: upload or replace a student's photo (multipart field `photo`). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)

  const db = useDb()
  await getStudent(db, school, id)
  const { data, type } = await readImageUpload(event, 'photo')

  const [current] = await db.select({ photoKey: students.photoKey }).from(students).where(whereSchool(students, school, eq(students.id, id)))
  const key = `schools/${school.id}/students/${id}.${type}`
  const storage = uploadsStorage()
  await storage.setItemRaw(key, data)
  if (current?.photoKey && current.photoKey !== key) await storage.removeItem(current.photoKey)

  const [row] = await db.update(students).set({ photoKey: key, photoUpdatedAt: new Date() })
    .where(whereSchool(students, school, eq(students.id, id))).returning()
  return { photoUrl: studentPhotoUrl(row!) }
})

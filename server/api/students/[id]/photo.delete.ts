import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { students } from '../../../database/schema'
import { getStudent } from '../../../services/students'
import { requireRole } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { uploadsStorage } from '../../../utils/school'
import { requireTenant, whereSchool } from '../../../utils/tenant'
import { idParamsSchema, validateParams } from '../../../utils/validation'

/** Admin: remove a student's photo (idempotent). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { id } = validateParams(event, idParamsSchema)

  const db = useDb()
  await getStudent(db, school, id)
  const [row] = await db.select({ photoKey: students.photoKey }).from(students).where(whereSchool(students, school, eq(students.id, id)))
  if (row?.photoKey) await uploadsStorage().removeItem(row.photoKey)
  await db.update(students).set({ photoKey: null, photoUpdatedAt: null }).where(whereSchool(students, school, eq(students.id, id)))
  return { photoUrl: null }
})

import type { AttendanceStatus } from '~~/shared/schemas/attendance'
import { attendanceMarks, attendanceRegisters, type School } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'

type SchoolRef = Pick<School, 'id'>

/** A register for an arm and date with the given marks (no checks: the API does those). */
export async function createRegister(db: Db, school: SchoolRef, { term, arm, date, takenBy, marks = [] }: {
  term: { id: string }
  arm: { id: string }
  date: string
  takenBy?: { id: string }
  marks?: { student: { id: string }, status: AttendanceStatus }[]
}) {
  const [register] = await db.insert(attendanceRegisters)
    .values({ schoolId: school.id, termId: term.id, classArmId: arm.id, date, takenById: takenBy?.id }).returning()
  if (marks.length) {
    await db.insert(attendanceMarks).values(marks.map(m => ({ schoolId: school.id, registerId: register!.id, studentId: m.student.id, status: m.status })))
  }
  return register!
}

import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { AttendanceStatus } from '../../../shared/schemas/attendance'
import { todayIn } from '../../../shared/utils/dates'
import { attendanceMarks, attendanceRegisters, classArms, classLevels, studentEnrolments, students, terms, users } from '../schema'
import type { Db } from '../../utils/db'

export interface DemoAttendance {
  /** Arm labels, e.g. "JSS 1A" */
  arms: string[]
  /** How many past school days get a register */
  days: number
  /** Email of the user who "took" them */
  takenBy: string
}

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Up to `count` weekdays (Mon–Fri) before `today`, inside the term dates, oldest first. */
export function schoolDaysBefore(today: string, count: number, term: { startsOn: string | null, endsOn: string | null }) {
  const days: string[] = []
  let date = addDays(term.endsOn && term.endsOn < today ? addDays(term.endsOn, 1) : today, -1)
  while (days.length < count && (!term.startsOn || date >= term.startsOn)) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
    if (weekday !== 0 && weekday !== 6) days.unshift(date)
    date = addDays(date, -1)
  }
  return days
}

/** A fixed, varied pattern: mostly present, a few absences and lates. */
function demoStatus(student: number, day: number): AttendanceStatus {
  if ((student * 7 + day * 3) % 23 === 0) return 'absent'
  if ((student * 5 + day) % 17 === 0) return 'late'
  return 'present'
}

/**
 * Idempotent: registers for the demo arms on the school days before today (never today, so the demo
 * can take it), in the current term; upserted by (arm, date), marks by (register, student).
 */
export async function seedAttendance(db: Db, schoolId: string, sessionId: string, demo: DemoAttendance, today = todayIn('Africa/Lagos')) {
  const [term] = await db.select().from(terms).where(and(eq(terms.schoolId, schoolId), eq(terms.isCurrent, true)))
  if (!term) return
  const [taker] = await db.select({ id: users.id }).from(users).where(and(eq(users.schoolId, schoolId), eq(users.email, demo.takenBy)))
  const arms = await db.select({ id: classArms.id, arm: classArms.name, level: classLevels.name })
    .from(classArms).innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id)).where(eq(classArms.schoolId, schoolId))
  const dates = schoolDaysBefore(today, demo.days, term)

  for (const label of demo.arms) {
    const arm = arms.find(a => `${a.level}${a.arm}` === label || `${a.level} ${a.arm}` === label)!
    const roster = await db.select({ id: students.id }).from(studentEnrolments)
      .innerJoin(students, eq(studentEnrolments.studentId, students.id))
      .where(and(eq(studentEnrolments.schoolId, schoolId), eq(studentEnrolments.sessionId, sessionId), eq(studentEnrolments.classArmId, arm.id), isNull(students.deletedAt)))
      .orderBy(asc(students.admissionNumber))
    if (!roster.length) continue

    for (const [day, date] of dates.entries()) {
      const [register] = await db.insert(attendanceRegisters)
        .values({ schoolId, termId: term.id, classArmId: arm.id, date, takenById: taker?.id })
        .onConflictDoUpdate({ target: [attendanceRegisters.schoolId, attendanceRegisters.classArmId, attendanceRegisters.date], set: { termId: term.id, updatedAt: sql`now()` } })
        .returning({ id: attendanceRegisters.id })
      await db.insert(attendanceMarks)
        .values(roster.map((student, i) => ({ schoolId, registerId: register!.id, studentId: student.id, status: demoStatus(i + 1, day + 1) })))
        .onConflictDoUpdate({ target: [attendanceMarks.schoolId, attendanceMarks.registerId, attendanceMarks.studentId], set: { status: sql`excluded.status` } })
    }
  }
}

import { date, index, integer, pgEnum, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { ATTENDANCE_STATUSES } from '../../../shared/schemas/attendance'
import { classArms, terms } from './academics'
import { schools } from './schools'
import { students } from './students'
import { users } from './users'

// Tenant tables: always query through whereSchool() (server/utils/tenant.ts)

export const attendanceStatus = pgEnum('attendance_status', ATTENDANCE_STATUSES)

const schoolId = () => uuid().notNull().references(() => schools.id, { onDelete: 'restrict' })
const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}

/** One register per class arm per day (docs/features/05-attendance.md). `takenById` = who saved it last. */
export const attendanceRegisters = pgTable('attendance_registers', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  termId: uuid().notNull().references(() => terms.id, { onDelete: 'restrict' }),
  classArmId: uuid().notNull().references(() => classArms.id, { onDelete: 'restrict' }),
  date: date({ mode: 'string' }).notNull(),
  takenById: uuid().references(() => users.id, { onDelete: 'set null' }),
  /** Goes up on every save; a register taken offline says which version it saw (Phase 10c conflict check) */
  version: integer().notNull().default(1),
  /** When a register taken offline arrived after its day ("Sent late (offline)"); null otherwise */
  sentLateAt: timestamp({ withTimezone: true }),
  ...timestamps,
}, t => [
  unique('attendance_registers_one_per_day').on(t.schoolId, t.classArmId, t.date),
  index('attendance_registers_term_idx').on(t.schoolId, t.termId, t.classArmId),
])

/** A student's status in a register. Kept when a student is removed (soft delete). */
export const attendanceMarks = pgTable('attendance_marks', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  registerId: uuid().notNull().references(() => attendanceRegisters.id, { onDelete: 'cascade' }),
  studentId: uuid().notNull().references(() => students.id, { onDelete: 'restrict' }),
  status: attendanceStatus().notNull(),
  ...timestamps,
}, t => [
  unique('attendance_marks_one_per_student').on(t.schoolId, t.registerId, t.studentId),
  index('attendance_marks_student_idx').on(t.schoolId, t.studentId),
])

export type AttendanceRegister = typeof attendanceRegisters.$inferSelect

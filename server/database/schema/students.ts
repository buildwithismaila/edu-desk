import { boolean, date, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { GENDERS, RELATIONSHIPS } from '../../../shared/schemas/students'
import { academicSessions, classArms, departments } from './academics'
import { schools } from './schools'
import { users } from './users'

// Tenant tables: always query through whereSchool() (server/utils/tenant.ts)

export const gender = pgEnum('gender', GENDERS)
export const guardianRelationship = pgEnum('guardian_relationship', RELATIONSHIPS)

const schoolId = () => uuid().notNull().references(() => schools.id, { onDelete: 'restrict' })
const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}

/** Students are soft-deleted (`deletedAt`): their admission number stays reserved and history is kept. */
export const students = pgTable('students', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  admissionNumber: text().notNull(),
  firstName: text().notNull(),
  middleName: text(),
  lastName: text().notNull(),
  gender: gender().notNull(),
  dateOfBirth: date({ mode: 'string' }),
  /** One of NIGERIAN_STATES (shared/constants/states.ts) */
  stateOfOrigin: text(),
  lga: text(),
  address: text(),
  /** SSS only */
  departmentId: uuid().references(() => departments.id, { onDelete: 'restrict' }),
  /** Storage key in the `uploads` mount, e.g. `schools/<id>/students/<studentId>.jpeg` */
  photoKey: text(),
  photoUpdatedAt: timestamp({ withTimezone: true }),
  admittedOn: date({ mode: 'string' }).notNull().defaultNow(),
  ...timestamps,
  deletedAt: timestamp({ withTimezone: true }),
}, t => [
  unique('students_school_admission_number_unique').on(t.schoolId, t.admissionNumber),
  index('students_school_name_idx').on(t.schoolId, t.lastName, t.firstName),
])

/** The student's class arm in a session (one per session; Phase 9 promotion adds the next one). */
export const studentEnrolments = pgTable('student_enrolments', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  sessionId: uuid().notNull().references(() => academicSessions.id, { onDelete: 'restrict' }),
  studentId: uuid().notNull().references(() => students.id, { onDelete: 'cascade' }),
  classArmId: uuid().notNull().references(() => classArms.id, { onDelete: 'restrict' }),
  ...timestamps,
}, t => [
  unique('student_enrolments_one_per_session').on(t.schoolId, t.sessionId, t.studentId),
  index('student_enrolments_arm_idx').on(t.schoolId, t.sessionId, t.classArmId),
])

/** Guardians are users with role `parent`; siblings share the same guardian row. */
export const studentGuardians = pgTable('student_guardians', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  studentId: uuid().notNull().references(() => students.id, { onDelete: 'cascade' }),
  guardianId: uuid().notNull().references(() => users.id, { onDelete: 'restrict' }),
  relationship: guardianRelationship().notNull().default('guardian'),
  isPrimary: boolean().notNull().default(false),
  ...timestamps,
}, t => [
  unique('student_guardians_unique').on(t.schoolId, t.studentId, t.guardianId),
  index('student_guardians_guardian_idx').on(t.schoolId, t.guardianId),
])

/** Last admission sequence used per school and year (incremented inside the admission transaction). */
export const admissionCounters = pgTable('admission_counters', {
  schoolId: schoolId(),
  year: integer().notNull(),
  lastNumber: integer().notNull().default(0),
}, t => [primaryKey({ columns: [t.schoolId, t.year] })])

export type Student = typeof students.$inferSelect
export type NewStudent = typeof students.$inferInsert
export type StudentEnrolment = typeof studentEnrolments.$inferSelect

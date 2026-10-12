import { index, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { academicSessions, classArms, subjects } from './academics'
import { schools } from './schools'
import { users } from './users'

// Tenant tables: always query through whereSchool() (server/utils/tenant.ts).
// Per session; deleting the session, arm or subject removes its assignments.

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}

/** The class teacher of an arm for a session (attendance, comments, ratings). */
export const classTeacherAssignments = pgTable('class_teacher_assignments', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: uuid().notNull().references(() => schools.id, { onDelete: 'restrict' }),
  sessionId: uuid().notNull().references(() => academicSessions.id, { onDelete: 'cascade' }),
  classArmId: uuid().notNull().references(() => classArms.id, { onDelete: 'cascade' }),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'restrict' }),
  ...timestamps,
}, t => [
  // One class teacher per arm per session
  unique('class_teacher_assignments_one_per_arm').on(t.schoolId, t.sessionId, t.classArmId),
  index('class_teacher_assignments_user_idx').on(t.schoolId, t.sessionId, t.userId),
])

/** The teacher of a subject in an arm for a session (score entry). */
export const subjectTeacherAssignments = pgTable('subject_teacher_assignments', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: uuid().notNull().references(() => schools.id, { onDelete: 'restrict' }),
  sessionId: uuid().notNull().references(() => academicSessions.id, { onDelete: 'cascade' }),
  classArmId: uuid().notNull().references(() => classArms.id, { onDelete: 'cascade' }),
  subjectId: uuid().notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'restrict' }),
  ...timestamps,
}, t => [
  // One teacher per subject per arm per session
  unique('subject_teacher_assignments_one_per_subject').on(t.schoolId, t.sessionId, t.classArmId, t.subjectId),
  index('subject_teacher_assignments_user_idx').on(t.schoolId, t.sessionId, t.userId),
])

export type ClassTeacherAssignment = typeof classTeacherAssignments.$inferSelect
export type SubjectTeacherAssignment = typeof subjectTeacherAssignments.$inferSelect

import { index, pgEnum, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { PROMOTION_OUTCOMES } from '../../../shared/utils/promotion'
import { academicSessions, classArms } from './academics'
import { schools } from './schools'
import { students } from './students'
import { users } from './users'

// Tenant tables: always query through whereSchool() (server/utils/tenant.ts). docs/features/10-dashboards-promotion.md

export const promotionOutcome = pgEnum('promotion_outcome', PROMOTION_OUTCOMES)

const schoolId = () => uuid().notNull().references(() => schools.id, { onDelete: 'restrict' })
const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}

/** One end-of-session promotion of a class arm. The unique key is the "can't run twice" rule. */
export const promotionRuns = pgTable('promotion_runs', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  fromSessionId: uuid().notNull().references(() => academicSessions.id, { onDelete: 'restrict' }),
  toSessionId: uuid().notNull().references(() => academicSessions.id, { onDelete: 'restrict' }),
  classArmId: uuid().notNull().references(() => classArms.id, { onDelete: 'restrict' }),
  promotedById: uuid().references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
}, t => [
  unique('promotion_runs_one_per_arm').on(t.schoolId, t.fromSessionId, t.classArmId),
])

/** Each student's outcome; graduated and withdrawn students have no target arm (and no next-session enrolment). */
export const studentPromotions = pgTable('student_promotions', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  /** Undo deletes the run and, with it, these rows */
  runId: uuid().notNull().references(() => promotionRuns.id, { onDelete: 'cascade' }),
  fromSessionId: uuid().notNull().references(() => academicSessions.id, { onDelete: 'restrict' }),
  studentId: uuid().notNull().references(() => students.id, { onDelete: 'cascade' }),
  fromClassArmId: uuid().notNull().references(() => classArms.id, { onDelete: 'restrict' }),
  outcome: promotionOutcome().notNull(),
  toClassArmId: uuid().references(() => classArms.id, { onDelete: 'restrict' }),
  ...timestamps,
}, t => [
  unique('student_promotions_one_per_session').on(t.schoolId, t.fromSessionId, t.studentId),
  index('student_promotions_run_idx').on(t.schoolId, t.runId),
])

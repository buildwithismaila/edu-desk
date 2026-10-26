import { index, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { RESULT_STATUSES } from '../../../shared/utils/results'
import { classArms, terms } from './academics'
import { schools } from './schools'
import { students } from './students'
import { users } from './users'

// Tenant tables: always query through whereSchool() (server/utils/tenant.ts). docs/features/07-results.md

/** No row also means draft; a returned arm keeps its row (status draft) with the reason. */
export const resultStatus = pgEnum('result_status', RESULT_STATUSES)

const schoolId = () => uuid().notNull().references(() => schools.id, { onDelete: 'restrict' })
const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}
const userRef = () => uuid().references(() => users.id, { onDelete: 'set null' })

/** Where an arm's results are in Draft → Submitted → Published for a term. */
export const resultStatuses = pgTable('result_statuses', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  termId: uuid().notNull().references(() => terms.id, { onDelete: 'restrict' }),
  classArmId: uuid().notNull().references(() => classArms.id, { onDelete: 'restrict' }),
  status: resultStatus().notNull(),
  submittedById: userRef(),
  submittedAt: timestamp({ withTimezone: true }),
  publishedById: userRef(),
  publishedAt: timestamp({ withTimezone: true }),
  /** Why the principal/admin sent it back to draft */
  returnedReason: text(),
  ...timestamps,
}, t => [
  unique('result_statuses_one_per_arm').on(t.schoolId, t.termId, t.classArmId),
])

/** Report cards as published (frozen): later changes to scales, names or classes don't alter them. */
export const publishedResults = pgTable('published_results', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  termId: uuid().notNull().references(() => terms.id, { onDelete: 'restrict' }),
  classArmId: uuid().notNull().references(() => classArms.id, { onDelete: 'restrict' }),
  studentId: uuid().notNull().references(() => students.id, { onDelete: 'restrict' }),
  report: jsonb().notNull(),
  ...timestamps,
}, t => [
  unique('published_results_one_per_student').on(t.schoolId, t.termId, t.studentId),
  index('published_results_arm_idx').on(t.schoolId, t.termId, t.classArmId),
])

/**
 * A term's result shown to the student's parents although fees for it are owed (Phase 10d: a payment plan, a
 * scholarship). Only matters while the school withholds results until paid.
 */
export const resultReleases = pgTable('result_releases', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  termId: uuid().notNull().references(() => terms.id, { onDelete: 'restrict' }),
  studentId: uuid().notNull().references(() => students.id, { onDelete: 'restrict' }),
  releasedById: userRef(),
  ...timestamps,
}, t => [
  unique('result_releases_one_per_student').on(t.schoolId, t.termId, t.studentId),
])

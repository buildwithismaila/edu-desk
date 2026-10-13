import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgEnum, pgTable, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { NURSERY_RATING_VALUES } from '../../../shared/constants/traits'
import { assessmentComponents, classArms, subjects, terms } from './academics'
import { schools } from './schools'
import { students } from './students'
import { users } from './users'

// Tenant tables: always query through whereSchool() (server/utils/tenant.ts). docs/features/06-score-entry.md

export const nurseryRating = pgEnum('nursery_rating', NURSERY_RATING_VALUES)

const schoolId = () => uuid().notNull().references(() => schools.id, { onDelete: 'restrict' })
const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}
const termId = () => uuid().notNull().references(() => terms.id, { onDelete: 'restrict' })
const studentId = () => uuid().notNull().references(() => students.id, { onDelete: 'restrict' })
const enteredById = () => uuid().references(() => users.id, { onDelete: 'set null' })

/**
 * One assessment component's score for a student, subject and term. No row = not entered; absent is
 * explicit (score null). No arm: a student who changes arm keeps their scores for the term.
 */
export const scoreEntries = pgTable('score_entries', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  termId: termId(),
  studentId: studentId(),
  subjectId: uuid().notNull().references(() => subjects.id, { onDelete: 'restrict' }),
  componentId: uuid().notNull().references(() => assessmentComponents.id, { onDelete: 'restrict' }),
  score: integer(),
  absent: boolean().notNull().default(false),
  enteredById: enteredById(),
  ...timestamps,
}, t => [
  unique('score_entries_one_per_cell').on(t.schoolId, t.termId, t.studentId, t.subjectId, t.componentId),
  index('score_entries_sheet_idx').on(t.schoolId, t.termId, t.subjectId),
  check('score_entries_score_or_absent', sql`${t.absent} = (${t.score} is null)`),
  check('score_entries_score_range', sql`${t.score} is null or ${t.score} between 0 and 100`),
])

/** Nursery: one skill rating per subject per term instead of numeric scores. */
export const nurseryRatings = pgTable('nursery_ratings', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  termId: termId(),
  studentId: studentId(),
  subjectId: uuid().notNull().references(() => subjects.id, { onDelete: 'restrict' }),
  rating: nurseryRating().notNull(),
  enteredById: enteredById(),
  ...timestamps,
}, t => [
  unique('nursery_ratings_one_per_subject').on(t.schoolId, t.termId, t.studentId, t.subjectId),
])

/** Affective and psychomotor traits rated 1–5 by the class teacher (keys: shared/constants/traits.ts). */
export const traitRatings = pgTable('trait_ratings', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  termId: termId(),
  studentId: studentId(),
  trait: text().notNull(),
  rating: smallint().notNull(),
  enteredById: enteredById(),
  ...timestamps,
}, t => [
  unique('trait_ratings_one_per_trait').on(t.schoolId, t.termId, t.studentId, t.trait),
  check('trait_ratings_range', sql`${t.rating} between 1 and 5`),
])

/** The class teacher's comment for the term (the principal's comes in Phase 7). */
export const termComments = pgTable('term_comments', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  termId: termId(),
  studentId: studentId(),
  classTeacherComment: text(),
  enteredById: enteredById(),
  ...timestamps,
}, t => [
  unique('term_comments_one_per_student').on(t.schoolId, t.termId, t.studentId),
])

/** A locked (term, arm): scores, ratings and comments are read-only until admin/principal unlocks. */
export const scoreLocks = pgTable('score_locks', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  termId: termId(),
  classArmId: uuid().notNull().references(() => classArms.id, { onDelete: 'restrict' }),
  lockedById: enteredById(),
  ...timestamps,
}, t => [
  unique('score_locks_one_per_arm').on(t.schoolId, t.termId, t.classArmId),
])

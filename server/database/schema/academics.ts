import { sql } from 'drizzle-orm'
import { boolean, check, date, integer, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { SECTIONS, TERM_NUMBERS } from '../../../shared/constants/academics'
import { schools } from './schools'

// Tenant tables: always query through whereSchool() (server/utils/tenant.ts)

export const section = pgEnum('section', SECTIONS)
export const termNumber = pgEnum('term_number', TERM_NUMBERS)

const schoolId = () => uuid().notNull().references(() => schools.id, { onDelete: 'restrict' })
const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}

export const academicSessions = pgTable('academic_sessions', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  /** e.g. `2026/2027` */
  name: text().notNull(),
  isCurrent: boolean().notNull().default(false),
  ...timestamps,
}, t => [
  unique('academic_sessions_school_name_unique').on(t.schoolId, t.name),
  // At most one current session per school
  uniqueIndex('academic_sessions_one_current').on(t.schoolId).where(sql`${t.isCurrent}`),
])

export const terms = pgTable('terms', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  sessionId: uuid().notNull().references(() => academicSessions.id, { onDelete: 'cascade' }),
  number: termNumber().notNull(),
  startsOn: date({ mode: 'string' }),
  endsOn: date({ mode: 'string' }),
  nextTermBeginsOn: date({ mode: 'string' }),
  isCurrent: boolean().notNull().default(false),
  ...timestamps,
}, t => [
  unique('terms_school_session_number_unique').on(t.schoolId, t.sessionId, t.number),
  // At most one current term per school
  uniqueIndex('terms_one_current').on(t.schoolId).where(sql`${t.isCurrent}`),
])

export const classLevels = pgTable('class_levels', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  section: section().notNull(),
  name: text().notNull(),
  sortOrder: integer().notNull(),
  ...timestamps,
}, t => [unique('class_levels_school_name_unique').on(t.schoolId, t.name)])

export const classArms = pgTable('class_arms', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  classLevelId: uuid().notNull().references(() => classLevels.id, { onDelete: 'restrict' }),
  name: text().notNull(),
  ...timestamps,
}, t => [unique('class_arms_school_level_name_unique').on(t.schoolId, t.classLevelId, t.name)])

export const departments = pgTable('departments', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  name: text().notNull(),
  ...timestamps,
}, t => [unique('departments_school_name_unique').on(t.schoolId, t.name)])

export const subjects = pgTable('subjects', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  section: section().notNull(),
  name: text().notNull(),
  code: text(),
  /** SSS only; null = core subject for the section. */
  departmentId: uuid().references(() => departments.id, { onDelete: 'restrict' }),
  ...timestamps,
}, t => [
  unique('subjects_school_section_name_unique').on(t.schoolId, t.section, t.name),
  check('subjects_department_only_sss', sql`${t.departmentId} is null or ${t.section} = 'sss'`),
])

export const assessmentComponents = pgTable('assessment_components', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  name: text().notNull(),
  maxScore: integer().notNull(),
  sortOrder: integer().notNull(),
  ...timestamps,
}, t => [
  unique('assessment_components_school_name_unique').on(t.schoolId, t.name),
  check('assessment_components_max_range', sql`${t.maxScore} between 1 and 100`),
])

export const gradeBands = pgTable('grade_bands', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  section: section().notNull(),
  grade: text().notNull(),
  minScore: integer().notNull(),
  maxScore: integer().notNull(),
  remark: text().notNull().default(''),
  sortOrder: integer().notNull(),
  ...timestamps,
}, t => [
  unique('grade_bands_school_section_grade_unique').on(t.schoolId, t.section, t.grade),
  check('grade_bands_not_nursery', sql`${t.section} <> 'nursery'`),
  check('grade_bands_score_range', sql`${t.minScore} between 0 and 100 and ${t.maxScore} between 0 and 100 and ${t.minScore} <= ${t.maxScore}`),
])

export type AcademicSession = typeof academicSessions.$inferSelect
export type Term = typeof terms.$inferSelect
export type ClassLevel = typeof classLevels.$inferSelect
export type ClassArm = typeof classArms.$inferSelect
export type Department = typeof departments.$inferSelect
export type Subject = typeof subjects.$inferSelect
export type AssessmentComponent = typeof assessmentComponents.$inferSelect
export type GradeBandRow = typeof gradeBands.$inferSelect

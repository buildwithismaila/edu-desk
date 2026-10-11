import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const schoolStatus = pgEnum('school_status', ['active', 'suspended'])

// Tenant root: every tenant table references schools.id, so this table has no schoolId
export const schools = pgTable('schools', {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  status: schoolStatus().notNull().default('active'),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export type School = typeof schools.$inferSelect
export type NewSchool = typeof schools.$inferInsert

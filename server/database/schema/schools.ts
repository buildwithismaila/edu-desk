import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { BankAccount } from '../../../shared/schemas/school'

export const schoolStatus = pgEnum('school_status', ['active', 'suspended'])

// Tenant root: every tenant table references schools.id, so this table has no schoolId
export const schools = pgTable('schools', {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  status: schoolStatus().notNull().default('active'),
  // Profile (Phase 2)
  address: text(),
  motto: text(),
  /** Normalised `+234…` (shared/utils/phone.ts). */
  phone: text(),
  email: text(),
  /** Storage key in the `uploads` mount, e.g. `schools/<id>/logo.png`; null = no logo. */
  logoKey: text(),
  /** Cache-busting version for the logo URL. */
  logoUpdatedAt: timestamp({ withTimezone: true }),
  /** Admission number prefix, e.g. GFA → GFA/2026/0001 (Phase 4); null until set or first admission. */
  admissionPrefix: text(),
  /** Show "position in class" on report cards (docs/domain.md). */
  showPositions: boolean().notNull().default(true),
  /** Phase 8: show the outstanding balance on published report cards */
  showFeesOnReportCard: boolean().notNull().default(false),
  /** Phase 10a: up to two accounts printed on fee invoices */
  bankAccounts: jsonb().$type<BankAccount[]>().notNull().default([]),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export type School = typeof schools.$inferSelect
export type NewSchool = typeof schools.$inferInsert

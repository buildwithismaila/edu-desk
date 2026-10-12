import { sql } from 'drizzle-orm'
import { boolean, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { ROLES } from '../../../shared/constants/roles'
import { schools } from './schools'

export const userRole = pgEnum('user_role', ROLES)

// First tenant table: always query through whereSchool() (server/utils/tenant.ts)
export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: uuid().notNull().references(() => schools.id, { onDelete: 'restrict' }),
  /** Stored trimmed and lowercase; unique per school. Staff always have one; guardians may log in by phone only. */
  email: text(),
  name: text().notNull(),
  role: userRole().notNull(),
  /** scrypt hash from nuxt-auth-utils' hashPassword(). */
  passwordHash: text().notNull(),
  isActive: boolean().notNull().default(true),
  /** Set by an admin password reset; the user must change it at next login. */
  mustChangePassword: boolean().notNull().default(false),
  lastLoginAt: timestamp({ withTimezone: true }),
  /** Normalised `+234…` (shared/utils/phone.ts); unique per school among active accounts; required for guardians. */
  phone: text(),
  /** Soft delete for staff who left (Phase 3): can't log in, hidden from lists; email stays reserved. */
  deletedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, t => [
  unique('users_school_email_unique').on(t.schoolId, t.email),
  // Login by phone (Phase 4): unique among active accounts, so a removed account's phone can be reused
  uniqueIndex('users_school_phone_unique').on(t.schoolId, t.phone).where(sql`${t.phone} is not null and ${t.deletedAt} is null`),
])

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

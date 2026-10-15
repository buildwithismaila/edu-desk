import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Failed-login counters for the login limiter (server/utils/login-throttle.ts), shared by every app instance.
 * Not a tenant table: keys are `account:<schoolId>:<login>` or `ip:<address>`, so a school is in the key itself.
 */
export const loginFailures = pgTable('login_failures', {
  key: text().primaryKey(),
  count: integer().notNull(),
  resetAt: timestamp({ withTimezone: true }).notNull(),
})

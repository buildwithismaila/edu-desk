import { sql } from 'drizzle-orm'
import { boolean, check, date, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { PAYMENT_METHODS } from '../../../shared/schemas/fees'
import { classArms, classLevels, terms } from './academics'
import { schools } from './schools'
import { students } from './students'
import { users } from './users'

// Tenant tables: always query through whereSchool() (server/utils/tenant.ts). Money is integer kobo.
// docs/features/08-fees.md

export const paymentMethod = pgEnum('payment_method', PAYMENT_METHODS)
export const discountKind = pgEnum('discount_kind', ['fixed', 'percent'])
export const billLineKind = pgEnum('bill_line_kind', ['item', 'carry_forward'])

const schoolId = () => uuid().notNull().references(() => schools.id, { onDelete: 'restrict' })
const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}
const userRef = () => uuid().references(() => users.id, { onDelete: 'set null' })

/** What a class level pays in a term; optional items (e.g. Bus) are added per student. */
export const feeItems = pgTable('fee_items', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  termId: uuid().notNull().references(() => terms.id, { onDelete: 'restrict' }),
  classLevelId: uuid().notNull().references(() => classLevels.id, { onDelete: 'restrict' }),
  name: text().notNull(),
  amountKobo: integer().notNull(),
  optional: boolean().notNull().default(false),
  sortOrder: integer().notNull().default(0),
  ...timestamps,
}, t => [
  unique('fee_items_name_per_level').on(t.schoolId, t.termId, t.classLevelId, t.name),
  check('fee_items_amount_positive', sql`${t.amountKobo} > 0`),
])

/** One bill per student per term; the level and arm they were in when it was generated. */
export const bills = pgTable('bills', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  termId: uuid().notNull().references(() => terms.id, { onDelete: 'restrict' }),
  studentId: uuid().notNull().references(() => students.id, { onDelete: 'restrict' }),
  classLevelId: uuid().notNull().references(() => classLevels.id, { onDelete: 'restrict' }),
  classArmId: uuid().notNull().references(() => classArms.id, { onDelete: 'restrict' }),
  generatedById: userRef(),
  ...timestamps,
}, t => [
  unique('bills_one_per_term').on(t.schoolId, t.termId, t.studentId),
  index('bills_arm_idx').on(t.schoolId, t.termId, t.classArmId),
])

/** Fee item lines, and at most one carry-forward line (negative = credit brought forward). */
export const billLines = pgTable('bill_lines', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  billId: uuid().notNull().references(() => bills.id, { onDelete: 'cascade' }),
  feeItemId: uuid().references(() => feeItems.id, { onDelete: 'set null' }),
  kind: billLineKind().notNull(),
  description: text().notNull(),
  amountKobo: integer().notNull(),
  ...timestamps,
}, t => [
  unique('bill_lines_one_per_item').on(t.billId, t.feeItemId),
  index('bill_lines_bill_idx').on(t.schoolId, t.billId),
])

/** `value`: kobo (fixed) or basis points (percent, on the item lines). Capped at the items when applied. */
export const discounts = pgTable('discounts', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  billId: uuid().notNull().references(() => bills.id, { onDelete: 'cascade' }),
  kind: discountKind().notNull(),
  value: integer().notNull(),
  reason: text().notNull(),
  createdById: userRef(),
  ...timestamps,
}, t => [
  check('discounts_value_positive', sql`${t.value} > 0`),
])

/**
 * Money received. Never edited or deleted: a mistake is reversed (the reversal columns, set once).
 * `channel`/`gatewayReference` are ready for online payments (post-MVP).
 */
export const payments = pgTable('payments', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: schoolId(),
  studentId: uuid().notNull().references(() => students.id, { onDelete: 'restrict' }),
  billId: uuid().notNull().references(() => bills.id, { onDelete: 'restrict' }),
  amountKobo: integer().notNull(),
  method: paymentMethod().notNull(),
  reference: text(),
  paidOn: date({ mode: 'string' }).notNull(),
  receiptNumber: text().notNull(),
  receivedById: userRef(),
  channel: text().notNull().default('manual'),
  gatewayReference: text(),
  reversedAt: timestamp({ withTimezone: true }),
  reversedById: userRef(),
  reversalReason: text(),
  ...timestamps,
}, t => [
  unique('payments_receipt_number_unique').on(t.schoolId, t.receiptNumber),
  index('payments_bill_idx').on(t.schoolId, t.billId),
  check('payments_amount_positive', sql`${t.amountKobo} > 0`),
])

/** Last receipt number used per school and year (incremented inside the payment transaction). */
export const receiptCounters = pgTable('receipt_counters', {
  schoolId: schoolId(),
  year: integer().notNull(),
  lastNumber: integer().notNull(),
}, t => [primaryKey({ columns: [t.schoolId, t.year] })])

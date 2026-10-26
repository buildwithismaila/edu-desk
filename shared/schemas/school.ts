import { z } from 'zod'
import { admissionPrefixSchema } from '../utils/admission-number'
import { optionalPhoneSchema } from './common'

/** Empty or whitespace-only text → null (clears the field). */
const optionalText = (max: number) => z.string().trim().max(max, `Use at most ${max} characters`).nullable()
  .transform(v => v || null)

/** A Nigerian bank account for fee payments, printed on invoices (account number: 10-digit NUBAN). */
export const bankAccountSchema = z.object({
  bankName: z.string().trim().min(2, 'Enter the bank').max(60, 'Use at most 60 characters'),
  accountName: z.string().trim().min(2, 'Enter the account name').max(100, 'Use at most 100 characters'),
  accountNumber: z.string().trim().regex(/^\d{10}$/, 'Enter the 10-digit account number'),
})
export type BankAccount = z.output<typeof bankAccountSchema>
export const MAX_BANK_ACCOUNTS = 2

export const schoolProfileSchema = z.object({
  name: z.string().trim().min(2, 'Enter the school name').max(120, 'Use at most 120 characters'),
  address: optionalText(300),
  motto: optionalText(150),
  phone: optionalPhoneSchema,
  email: z.union([z.literal(''), z.email('Enter a valid email address')]).nullable().transform(v => v || null),
  showPositions: z.boolean(),
  showFeesOnReportCard: z.boolean(),
  withholdResultsUntilPaid: z.boolean(),
  admissionPrefix: admissionPrefixSchema,
  bankAccounts: z.array(bankAccountSchema).max(MAX_BANK_ACCOUNTS, `At most ${MAX_BANK_ACCOUNTS} bank accounts`),
}).partial()

export type SchoolProfileInput = z.input<typeof schoolProfileSchema>

/** Logo uploads: at most 1 MB; PNG, JPEG or WebP (checked by file signature on the server). */
export const LOGO_MAX_BYTES = 1024 * 1024

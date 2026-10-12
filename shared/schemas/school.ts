import { z } from 'zod'
import { optionalPhoneSchema } from './common'

/** Empty or whitespace-only text → null (clears the field). */
const optionalText = (max: number) => z.string().trim().max(max, `Use at most ${max} characters`).nullable()
  .transform(v => v || null)

export const schoolProfileSchema = z.object({
  name: z.string().trim().min(2, 'Enter the school name').max(120, 'Use at most 120 characters'),
  address: optionalText(300),
  motto: optionalText(150),
  phone: optionalPhoneSchema,
  email: z.union([z.literal(''), z.email('Enter a valid email address')]).nullable().transform(v => v || null),
  showPositions: z.boolean(),
}).partial()

export type SchoolProfileInput = z.input<typeof schoolProfileSchema>

/** Logo uploads: at most 1 MB; PNG, JPEG or WebP (checked by file signature on the server). */
export const LOGO_MAX_BYTES = 1024 * 1024

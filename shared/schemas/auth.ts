import { z } from 'zod'

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

/** Trimmed, lowercased email (how emails are stored). */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'))

export const loginSchema = z.object({
  email: emailSchema,
  // No minimum here: the length rule applies when a password is set, not when logging in
  password: z.string().min(1, 'Enter your password').max(PASSWORD_MAX_LENGTH),
})

export type LoginInput = z.input<typeof loginSchema>

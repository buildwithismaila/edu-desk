import { z } from 'zod'
import { normalisePhone } from '../utils/phone'

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

/** Trimmed, lowercased email (how emails are stored). */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'))

const NOT_A_LOGIN = 'Enter your email or phone number'

/** An email (contains @) or a Nigerian phone in any common format → `{ email }` or `{ phone }`. */
// Explicit return type: inferred literal unions get `email?: undefined` / `phone?: undefined`,
// which stops `'email' in login` from narrowing
export const loginIdentifierSchema = z.string().trim().min(1, NOT_A_LOGIN).transform((value, ctx): { email: string } | { phone: string } => {
  if (value.includes('@')) {
    const email = emailSchema.safeParse(value)
    if (email.success) return { email: email.data }
  }
  else {
    const phone = normalisePhone(value)
    if (phone) return { phone }
  }
  ctx.addIssue({ code: 'custom', message: NOT_A_LOGIN })
  return z.NEVER
})

export const loginSchema = z.object({
  login: loginIdentifierSchema,
  // No minimum here: the length rule applies when a password is set, not when logging in
  password: z.string().min(1, 'Enter your password').max(PASSWORD_MAX_LENGTH),
})

export type LoginInput = z.input<typeof loginSchema>

export const newPasswordSchema = z.string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`)

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(PASSWORD_MAX_LENGTH),
  newPassword: newPasswordSchema,
  confirmPassword: z.string(),
})
  .refine(d => d.confirmPassword === d.newPassword, { path: ['confirmPassword'], message: 'Passwords don\'t match' })
  .refine(d => d.newPassword !== d.currentPassword, { path: ['newPassword'], message: 'Choose a password different from the current one' })

export type ChangePasswordInput = z.input<typeof changePasswordSchema>

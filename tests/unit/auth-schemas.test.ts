import { describe, expect, it } from 'vitest'
import { changePasswordSchema, loginSchema } from '~~/shared/schemas/auth'

describe('loginSchema', () => {
  it('trims and lowercases the email', () => {
    expect(loginSchema.parse({ email: '  Admin@GreenField.TEST ', password: 'x' })).toEqual({ email: 'admin@greenfield.test', password: 'x' })
  })

  it.each([
    ['invalid email', { email: 'not-an-email', password: 'secret123' }, 'email'],
    ['missing email', { password: 'secret123' }, 'email'],
    ['empty password', { email: 'a@b.test', password: '' }, 'password'],
    ['missing password', { email: 'a@b.test' }, 'password'],
    ['overlong password', { email: 'a@b.test', password: 'x'.repeat(129) }, 'password'],
  ])('rejects %s', (_case, input, field) => {
    const result = loginSchema.safeParse(input)
    expect(result.success).toBe(false)
    expect(result.error?.issues.map(i => i.path[0])).toContain(field)
  })

  it('does not apply the new-password length rule at login', () => {
    expect(loginSchema.safeParse({ email: 'a@b.test', password: 'short' }).success).toBe(true)
  })
})

describe('changePasswordSchema', () => {
  const valid = { currentPassword: 'old-password', newPassword: 'new-password', confirmPassword: 'new-password' }

  it('accepts a valid change', () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true)
  })

  it.each([
    [7, false],
    [8, true],
    [128, true],
    [129, false],
  ])('a %i-character new password is valid: %s', (length, ok) => {
    const password = 'x'.repeat(length)
    expect(changePasswordSchema.safeParse({ ...valid, newPassword: password, confirmPassword: password }).success).toBe(ok)
  })

  it.each([
    ['confirmation mismatch', { confirmPassword: 'different' }, 'confirmPassword'],
    ['new password equal to the current one', { newPassword: 'old-password', confirmPassword: 'old-password' }, 'newPassword'],
    ['missing current password', { currentPassword: '' }, 'currentPassword'],
  ])('rejects a %s', (_case, override, field) => {
    const result = changePasswordSchema.safeParse({ ...valid, ...override })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map(i => i.path[0])).toContain(field)
  })
})

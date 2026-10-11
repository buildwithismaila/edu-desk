import { describe, expect, it } from 'vitest'
import { loginSchema } from '~~/shared/schemas/auth'

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

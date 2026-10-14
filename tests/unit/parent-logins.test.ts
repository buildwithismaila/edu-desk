import { describe, expect, it } from 'vitest'
import { parentLoginStatus } from '~~/shared/utils/parent-logins'

describe('parentLoginStatus', () => {
  it('is active once the parent has set their own password', () => {
    expect(parentLoginStatus({ mustChangePassword: false, temporaryPasswordAt: null })).toBe('active')
    expect(parentLoginStatus({ mustChangePassword: false, temporaryPasswordAt: new Date() })).toBe('active')
  })

  it('is issued while a temporary password we showed is waiting to be used', () => {
    expect(parentLoginStatus({ mustChangePassword: true, temporaryPasswordAt: '2026-10-14T08:00:00Z' })).toBe('issued')
  })

  it('is none when nobody has a password for them (imported parents)', () => {
    expect(parentLoginStatus({ mustChangePassword: true, temporaryPasswordAt: null })).toBe('none')
  })
})

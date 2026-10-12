import { describe, expect, it } from 'vitest'
import { ROLES } from '~~/shared/constants/roles'
import { isAssignableRole, wouldLeaveNoActiveAdmin } from '~~/shared/utils/staff'

describe('isAssignableRole', () => {
  it.each(ROLES.map(role => [role, ['teacher', 'principal', 'admin'].includes(role)] as const))('%s → %s', (role, expected) => {
    expect(isAssignableRole(role)).toBe(expected)
  })
})

describe('wouldLeaveNoActiveAdmin', () => {
  const only = [{ id: 'a1', role: 'admin' as const, isActive: true }]
  const two = [...only, { id: 'a2', role: 'admin' as const, isActive: true }]
  const oneActiveOneInactive = [...only, { id: 'a2', role: 'admin' as const, isActive: false }]

  it.each(['deactivate', 'remove', 'demote'] as const)('is true when the only active admin is changed (%s)', (kind) => {
    expect(wouldLeaveNoActiveAdmin(only, { userId: 'a1', kind })).toBe(true)
  })

  it.each(['deactivate', 'remove', 'demote'] as const)('is false when another active admin remains (%s)', (kind) => {
    expect(wouldLeaveNoActiveAdmin(two, { userId: 'a1', kind })).toBe(false)
  })

  it('does not count an inactive admin as a remaining admin', () => {
    expect(wouldLeaveNoActiveAdmin(oneActiveOneInactive, { userId: 'a1', kind: 'remove' })).toBe(true)
  })

  it('is false when the user changed is not an active admin', () => {
    expect(wouldLeaveNoActiveAdmin(oneActiveOneInactive, { userId: 'a2', kind: 'remove' })).toBe(false)
    expect(wouldLeaveNoActiveAdmin(only, { userId: 'teacher-1', kind: 'deactivate' })).toBe(false)
  })

  it('ignores non-admin users in the list', () => {
    const mixed = [...only, { id: 't1', role: 'teacher' as const, isActive: true }]
    expect(wouldLeaveNoActiveAdmin(mixed, { userId: 'a1', kind: 'demote' })).toBe(true)
  })
})

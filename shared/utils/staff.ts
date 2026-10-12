import type { Role } from '../constants/roles'

/** Roles that can be class or subject teachers (docs/features/03-staff.md): not bursars or parents. */
export const ASSIGNABLE_ROLES = ['teacher', 'principal', 'admin'] as const satisfies readonly Role[]

export function isAssignableRole(role: Role) {
  return (ASSIGNABLE_ROLES as readonly Role[]).includes(role)
}

/**
 * Whether deactivating, removing or demoting `userId` would leave the school without an active admin.
 * `people`: the school's (non-removed) users, or at least all of its admins.
 */
export function wouldLeaveNoActiveAdmin(
  people: { id: string, role: Role, isActive: boolean }[],
  change: { userId: string, kind: 'deactivate' | 'remove' | 'demote' },
) {
  const activeAdmins = people.filter(p => p.role === 'admin' && p.isActive)
  if (!activeAdmins.some(a => a.id === change.userId)) return false
  return activeAdmins.length === 1
}

/** School user roles (docs/domain.md → Roles & permissions). Class/subject teacher are assignments, not roles. */
export const ROLES = ['admin', 'principal', 'bursar', 'teacher', 'parent'] as const

export type Role = typeof ROLES[number]

/** School staff (everyone except parents). */
export const STAFF_ROLES = ['admin', 'principal', 'bursar', 'teacher'] as const satisfies readonly Role[]
export type StaffRole = typeof STAFF_ROLES[number]

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin / Proprietor',
  principal: 'Principal / Head Teacher',
  bursar: 'Bursar',
  teacher: 'Teacher',
  parent: 'Parent / Guardian',
}

export function hasRole(user: { role: Role }, roles: readonly Role[]) {
  return roles.includes(user.role)
}

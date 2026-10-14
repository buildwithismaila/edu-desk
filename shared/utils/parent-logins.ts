// Parent login status for the Parent logins page (docs/features/10a-pilot-readiness.md)

export const PARENT_LOGIN_STATUSES = ['none', 'issued', 'active'] as const
export type ParentLoginStatus = typeof PARENT_LOGIN_STATUSES[number]

export const PARENT_LOGIN_STATUS_LABELS: Record<ParentLoginStatus, string> = {
  none: 'No login yet',
  issued: 'Slip given, not used yet',
  active: 'Active',
}

/**
 * Active once they've set their own password; "issued" while a temporary password we showed someone is
 * waiting to be used; "none" when nobody has a password for them (e.g. imported from a spreadsheet).
 */
export function parentLoginStatus(user: { mustChangePassword: boolean, temporaryPasswordAt: Date | string | null }): ParentLoginStatus {
  if (!user.mustChangePassword) return 'active'
  return user.temporaryPasswordAt ? 'issued' : 'none'
}

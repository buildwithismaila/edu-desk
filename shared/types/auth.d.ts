import type { Role } from '../constants/roles'

declare module '#auth-utils' {
  /** Sent to the client via /api/_auth/session. */
  interface User {
    id: string
    name: string
    role: Role
    mustChangePassword: boolean
  }

  /** Server-only session data (never sent to the client). */
  interface SecureSessionData {
    schoolId: string
  }
}

export {}

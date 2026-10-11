import type { Role } from '#shared/constants/roles'

declare module '#app' {
  interface PageMeta {
    /** Roles allowed on this page; others are redirected to `/` (app/middleware/auth.global.ts). */
    roles?: Role[]
    /** Reachable without logging in (e.g. /login). */
    public?: boolean
  }
}

export {}

import type { TenantSchool } from '../utils/tenant'

declare module 'h3' {
  interface H3EventContext {
    /** Set by server/middleware/00.tenant.ts; read it via requireTenant(event). */
    school?: TenantSchool
  }
}

export {}

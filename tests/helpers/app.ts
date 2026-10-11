import { createApp, createRouter, defineEventHandler, toWebHandler } from 'h3'
import schoolHandler from '~~/server/api/school.get'
import tenantMiddleware from '~~/server/middleware/00.tenant'
import { clearTenantCache } from '~~/server/utils/tenant'
import { setDb, type Db } from '~~/server/utils/db'

interface RequestOptions extends RequestInit {
  /** Host header, e.g. `greenfield.lvh.me:3000` — this is how tests pick the tenant. */
  host: string
}

/**
 * The real tenant middleware and route handlers mounted in a plain h3 app, backed by `db`.
 * Mirrors Nitro's order: middleware first, then the router.
 */
export function createTestApp(db: Db) {
  setDb(db)
  clearTenantCache()

  const app = createApp()
  app.use(tenantMiddleware)
  app.use(createRouter().get('/api/school', schoolHandler))
  // Stand-in for Nuxt's asset/renderer handlers, to check which paths the middleware lets through
  app.use(defineEventHandler(() => 'passed through'))

  const handler = toWebHandler(app)

  return {
    request(path: string, { host, headers, ...init }: RequestOptions) {
      return handler(new Request(`http://${host}${path}`, { ...init, headers: { ...headers, host } }))
    },
  }
}

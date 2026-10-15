// defineNitroPlugin and useEvent are Nitro auto-imports (useEvent needs nitro.experimental.asyncContext)
import { createDb, setRequestDbProvider } from '../utils/db'
import { type RequestDbContext, requestScopedDb } from '../utils/request-db'

// On Cloudflare Workers each request gets its own database client (server/utils/request-db.ts), closed after the
// response. On Node nothing changes: requestScopedDb() returns undefined and useDb() uses the shared pool.
export default defineNitroPlugin((nitroApp) => {
  setRequestDbProvider(() => {
    let context: RequestDbContext
    try {
      context = useEvent().context as RequestDbContext
    }
    catch {
      return undefined // outside a request
    }
    return requestScopedDb(context, url => createDb(url, { requestScoped: true }))
  })

  nitroApp.hooks.hook('afterResponse', (event) => {
    const db = (event.context as RequestDbContext).db as { $client?: { end: () => Promise<void> } } | undefined
    if (db?.$client) event.waitUntil(db.$client.end())
  })
})

import type { Db } from './db'

/** The parts of a request's context this needs: Nitro puts Cloudflare's bindings at `context.cloudflare.env`. */
export interface RequestDbContext {
  cloudflare?: { env?: { DB?: { connectionString?: string } } }
  db?: Db
}

/**
 * On Cloudflare Workers a database connection can't be reused by another request, so each request gets its own
 * client, from the Hyperdrive binding `DB` (Hyperdrive pools the real connections to Supabase), kept on the
 * request's context. Anywhere else (Node: VPS, dev, tests) it returns undefined and the shared pool is used.
 */
export function requestScopedDb(context: RequestDbContext, create: (url: string) => Db): Db | undefined {
  const url = context.cloudflare?.env?.DB?.connectionString
  if (!url) return undefined
  return (context.db ??= create(url))
}

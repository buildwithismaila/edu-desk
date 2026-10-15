import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../database/schema'

/** Shared by the postgres.js (dev/prod) and PGlite (tests) drivers. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

/** Must match `casing` in drizzle.config.ts so camelCase keys map to snake_case columns. */
export const DB_CASING = 'snake_case'

let db: Db | undefined
let requestDb: (() => Db | undefined) | undefined

/**
 * A database for a connection URL. `requestScoped` is for Cloudflare Workers (one client per request, through
 * Hyperdrive): a few connections and no type lookups at connect, as Cloudflare recommends.
 */
export function createDb(url: string, { requestScoped = false } = {}) {
  return requestScoped
    ? drizzle({ connection: { url, max: 5, fetch_types: false }, schema, casing: DB_CASING })
    : drizzle(url, { schema, casing: DB_CASING })
}

/** Nitro only (server/plugins/request-db.ts): gives useDb() the current request's client on Cloudflare. */
export function setRequestDbProvider(provider: (() => Db | undefined) | undefined) {
  requestDb = provider
}

export function useDb(): Db {
  if (db) return db
  const scoped = requestDb?.()
  if (scoped) return scoped
  if (!db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    db = createDb(url)
  }
  return db
}

/** Tests only: point useDb() at another database (e.g. PGlite). */
export function setDb(instance: Db | undefined) {
  db = instance
}

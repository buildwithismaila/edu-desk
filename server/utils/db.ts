import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../database/schema'

/** Shared by the postgres.js (dev/prod) and PGlite (tests) drivers. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

/** Must match `casing` in drizzle.config.ts so camelCase keys map to snake_case columns. */
export const DB_CASING = 'snake_case'

let db: Db | undefined

export function createDb(url: string) {
  return drizzle(url, { schema, casing: DB_CASING })
}

export function useDb(): Db {
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

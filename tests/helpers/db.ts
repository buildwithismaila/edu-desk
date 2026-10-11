import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from '~~/server/database/schema'
import { DB_CASING, type Db } from '~~/server/utils/db'

const migrationsFolder = fileURLToPath(new URL('../../server/database/migrations', import.meta.url))

/** Fresh in-memory Postgres with the real migrations applied. Call once per test file. */
export async function createTestDb(): Promise<Db> {
  const db = drizzle({ client: new PGlite(), schema, casing: DB_CASING })
  await migrate(db, { migrationsFolder })
  return db
}

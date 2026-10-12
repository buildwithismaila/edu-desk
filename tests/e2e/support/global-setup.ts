import { fileURLToPath } from 'node:url'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import * as schema from '../../../server/database/schema'
import { seed } from '../../../server/database/seed/seed'
import { DB_CASING } from '../../../server/utils/db'
import { SCHOOL_TIME_ZONE, todayIn } from '../../../shared/utils/dates'
import { e2eDatabaseUrl } from './database'

const migrationsFolder = fileURLToPath(new URL('../../../server/database/migrations', import.meta.url))

/** Creates the E2E database if missing, then applies migrations and the demo seed. */
export default async function globalSetup() {
  const url = new URL(e2eDatabaseUrl())
  const name = url.pathname.slice(1)
  if (!/^\w+$/.test(name)) throw new Error(`Unexpected E2E database name: ${name}`)

  const adminUrl = new URL(url)
  adminUrl.pathname = '/postgres'
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} })
  try {
    const existing = await admin`select 1 from pg_database where datname = ${name}`
    if (existing.length === 0) await admin.unsafe(`create database "${name}"`)
  }
  finally {
    await admin.end()
  }

  const client = postgres(url.toString(), { max: 1, onnotice: () => {} })
  try {
    const db = drizzle({ client, schema, casing: DB_CASING })
    await migrate(db, { migrationsFolder })
    await seed(db)
    // Attendance needs today inside the current term; the seeded term (14/09–18/12/2026) won't always contain it
    const today = todayIn(SCHOOL_TIME_ZONE)
    await db.update(schema.terms)
      .set({ startsOn: sql`least(${schema.terms.startsOn}, ${today}::date)`, endsOn: sql`greatest(${schema.terms.endsOn}, ${today}::date)` })
      .where(eq(schema.terms.isCurrent, true))
  }
  finally {
    await client.end()
  }
}

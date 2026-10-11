import { sql } from 'drizzle-orm'
import { type NewSchool, schools } from '../schema'
import type { Db } from '../../utils/db'

const demoSchools: NewSchool[] = [
  { slug: 'greenfield', name: 'Greenfield Academy', status: 'active' },
  { slug: 'sunrise', name: 'Sunrise Schools', status: 'active' },
  { slug: 'hillside', name: 'Hillside College', status: 'suspended' },
]

/** Idempotent: upserts by slug, so it can be re-run at any time. */
export async function seed(db: Db) {
  await db
    .insert(schools)
    .values(demoSchools)
    .onConflictDoUpdate({
      target: schools.slug,
      set: { name: sql`excluded.name`, status: sql`excluded.status`, updatedAt: sql`now()` },
    })
}

import { sql } from 'drizzle-orm'
import { type NewSchool, type NewUser, schools, users } from '../schema'
import type { Db } from '../../utils/db'
import { DEMO_PASSWORD_HASH } from './demo-password'

const demoSchools: NewSchool[] = [
  { slug: 'greenfield', name: 'Greenfield Academy', status: 'active' },
  { slug: 'sunrise', name: 'Sunrise Schools', status: 'active' },
  { slug: 'hillside', name: 'Hillside College', status: 'suspended' },
]

type DemoUser = Pick<NewUser, 'email' | 'name' | 'role'> & { school: string, isActive?: boolean }

// All share the demo password (see demo-password.ts)
const demoUsers: DemoUser[] = [
  { school: 'greenfield', email: 'admin@greenfield.test', name: 'Adaeze Okafor', role: 'admin' },
  { school: 'greenfield', email: 'principal@greenfield.test', name: 'Emeka Nwosu', role: 'principal' },
  { school: 'greenfield', email: 'bursar@greenfield.test', name: 'Fatima Bello', role: 'bursar' },
  { school: 'greenfield', email: 'teacher@greenfield.test', name: 'Tunde Adeyemi', role: 'teacher' },
  { school: 'greenfield', email: 'parent@greenfield.test', name: 'Ngozi Eze', role: 'parent' },
  { school: 'greenfield', email: 'inactive@greenfield.test', name: 'Musa Ibrahim', role: 'teacher', isActive: false },
  { school: 'sunrise', email: 'admin@sunrise.test', name: 'Bola Ogunleye', role: 'admin' },
]

/** Idempotent: upserts schools by slug and users by (school, email), resetting demo passwords and flags. */
export async function seed(db: Db) {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data in production')

  const seededSchools = await db
    .insert(schools)
    .values(demoSchools)
    .onConflictDoUpdate({
      target: schools.slug,
      set: { name: sql`excluded.name`, status: sql`excluded.status`, updatedAt: sql`now()` },
    })
    .returning({ id: schools.id, slug: schools.slug })
  const schoolIds = new Map(seededSchools.map(s => [s.slug, s.id]))

  await db
    .insert(users)
    .values(demoUsers.map(({ school, isActive = true, ...user }) => ({
      ...user,
      schoolId: schoolIds.get(school)!,
      passwordHash: DEMO_PASSWORD_HASH,
      isActive,
      mustChangePassword: false,
    })))
    .onConflictDoUpdate({
      target: [users.schoolId, users.email],
      set: {
        name: sql`excluded.name`,
        role: sql`excluded.role`,
        passwordHash: sql`excluded.password_hash`,
        isActive: sql`excluded.is_active`,
        mustChangePassword: sql`excluded.must_change_password`,
        updatedAt: sql`now()`,
      },
    })
}

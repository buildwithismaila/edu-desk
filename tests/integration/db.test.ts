import { eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { schools, users } from '~~/server/database/schema'
import { DEMO_PASSWORD, DEMO_PASSWORD_HASH } from '~~/server/database/seed/demo-password'
import { seed } from '~~/server/database/seed/seed'
import type { Db } from '~~/server/utils/db'
import { createSchool, createTwoSchools } from '../factories/schools'
import { createUser } from '../factories/users'
import { createTestDb } from '../helpers/db'
import { verifyPassword } from '../helpers/nitro-imports'

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

describe('database tooling', () => {
  it('applies the migrations to a fresh, empty database', async () => {
    await expect(db.select().from(schools)).resolves.toEqual([])
  })

  it('defaults a new school to active with timestamps', async () => {
    const school = await createSchool(db)
    expect(school.status).toBe('active')
    expect(school.createdAt).toBeInstanceOf(Date)
    expect(school.updatedAt).toBeInstanceOf(Date)
  })

  it('rejects a duplicate slug', async () => {
    const school = await createSchool(db)
    await expect(createSchool(db, { slug: school.slug })).rejects.toThrow()
  })

  it('createTwoSchools creates two distinct schools', async () => {
    const { schoolA, schoolB } = await createTwoSchools(db)
    expect(schoolA.id).not.toBe(schoolB.id)
    expect(schoolA.slug).not.toBe(schoolB.slug)
  })
})

describe('users table', () => {
  it('defaults a new user to active, not forced to change password, never logged in', async () => {
    const user = await createUser(db, await createSchool(db))
    expect(user).toMatchObject({ isActive: true, mustChangePassword: false, lastLoginAt: null })
  })

  it('rejects a duplicate email within one school', async () => {
    const school = await createSchool(db)
    await createUser(db, school, { email: 'dup@example.test' })
    await expect(createUser(db, school, { email: 'dup@example.test' })).rejects.toThrow()
  })

  it('allows the same email in two schools', async () => {
    const { schoolA, schoolB } = await createTwoSchools(db)
    await createUser(db, schoolA, { email: 'same@example.test' })
    await expect(createUser(db, schoolB, { email: 'same@example.test' })).resolves.toBeDefined()
  })
})

describe('seed', () => {
  it('is idempotent and upserts the demo schools by slug', async () => {
    await seed(db)
    await db.update(schools).set({ name: 'Renamed' }).where(eq(schools.slug, 'greenfield'))
    await seed(db)

    const rows = await db.select().from(schools).where(sql`${schools.slug} in ('greenfield', 'sunrise', 'hillside')`)
    const bySlug = Object.fromEntries(rows.map(r => [r.slug, r]))

    expect(rows).toHaveLength(3)
    expect(bySlug.greenfield).toMatchObject({ name: 'Greenfield Academy', status: 'active' })
    expect(bySlug.sunrise).toMatchObject({ name: 'Sunrise Schools', status: 'active' })
    expect(bySlug.hillside).toMatchObject({ name: 'Hillside College', status: 'suspended' })
  })

  it('seeds a user per role at greenfield, more teachers, an inactive teacher and a sunrise admin, re-runnably', async () => {
    await seed(db)
    await db.update(users).set({ isActive: false, mustChangePassword: true }).where(eq(users.email, 'admin@greenfield.test'))
    await seed(db)

    const rows = await db
      .select({ email: users.email, role: users.role, isActive: users.isActive, mustChangePassword: users.mustChangePassword, slug: schools.slug })
      .from(users)
      .innerJoin(schools, eq(users.schoolId, schools.id))
      .where(sql`${schools.slug} in ('greenfield', 'sunrise')`)

    // Phase 3 added more Greenfield teachers (see seed-staff.test.ts)
    expect(rows.map(r => `${r.slug}:${r.email}:${r.role}:${r.isActive}`).sort()).toEqual([
      'greenfield:admin@greenfield.test:admin:true',
      'greenfield:bursar@greenfield.test:bursar:true',
      'greenfield:chioma@greenfield.test:teacher:true',
      'greenfield:grace@greenfield.test:teacher:true',
      'greenfield:ibrahim@greenfield.test:teacher:true',
      'greenfield:inactive@greenfield.test:teacher:false',
      'greenfield:kemi@greenfield.test:teacher:true',
      'greenfield:parent@greenfield.test:parent:true',
      'greenfield:principal@greenfield.test:principal:true',
      'greenfield:teacher@greenfield.test:teacher:true',
      'greenfield:yusuf@greenfield.test:teacher:true',
      'sunrise:admin@sunrise.test:admin:true',
    ])
    // Re-seeding resets flags: only Kemi is seeded with a forced password change
    expect(rows.filter(r => r.mustChangePassword).map(r => r.email)).toEqual(['kemi@greenfield.test'])
  })

  it('stores a demo password hash that verifies against the demo password', async () => {
    expect(DEMO_PASSWORD).toBe('password123')
    expect(await verifyPassword(DEMO_PASSWORD_HASH, DEMO_PASSWORD)).toBe(true)
    expect(await verifyPassword(DEMO_PASSWORD_HASH, 'wrong-password')).toBe(false)
  })

  it('refuses to run in production', async () => {
    const original = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      await expect(seed(db)).rejects.toThrow(/production/)
    }
    finally {
      process.env.NODE_ENV = original
    }
  })
})

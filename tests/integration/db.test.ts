import { eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { schools } from '~~/server/database/schema'
import { seed } from '~~/server/database/seed/seed'
import type { Db } from '~~/server/utils/db'
import { createSchool, createTwoSchools } from '../factories/schools'
import { createTestDb } from '../helpers/db'

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
})

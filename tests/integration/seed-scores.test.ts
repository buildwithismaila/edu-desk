import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { nurseryRatings, schools, scoreEntries, subjects, termComments, traitRatings } from '~~/server/database/schema'
import { seed } from '~~/server/database/seed/seed'
import type { Db } from '~~/server/utils/db'
import { createTestDb } from '../helpers/db'

let db: Db
let ids: Record<string, string>

beforeAll(async () => {
  db = await createTestDb()
  await seed(db)
  const rows = await db.select({ id: schools.id, slug: schools.slug }).from(schools)
  ids = Object.fromEntries(rows.map(r => [r.slug, r.id]))
})

const count = async () => ({
  scores: (await db.select().from(scoreEntries)).length,
  traits: (await db.select().from(traitRatings)).length,
  comments: (await db.select().from(termComments)).length,
  nursery: (await db.select().from(nurseryRatings)).length,
})

describe('demo seed: scores', () => {
  it('fills JSS 1A Mathematics (with one ABS) and half of JSS 1B, all within the component maxima', async () => {
    const rows = await db.select().from(scoreEntries).where(eq(scoreEntries.schoolId, ids.greenfield!))
    // 10 JSS 1A + 4 of 8 JSS 1B students, 3 components each
    expect(rows).toHaveLength((10 + 4) * 3)
    expect(rows.filter(r => r.absent)).toHaveLength(1)
    expect(rows.every(r => r.absent ? r.score === null : r.score! >= 0 && r.score! <= 60)).toBe(true)
  })

  it('rates half of JSS 1A on every trait, with comments, and gives Nursery 1A Numeracy ratings', async () => {
    expect(await db.select().from(traitRatings).where(eq(traitRatings.schoolId, ids.greenfield!))).toHaveLength(5 * 10)
    expect(await db.select().from(termComments).where(eq(termComments.schoolId, ids.greenfield!))).toHaveLength(5)
    const [numeracy] = await db.select().from(subjects).where(and(eq(subjects.schoolId, ids.greenfield!), eq(subjects.name, 'Numeracy')))
    expect(numeracy!.section).toBe('nursery')
    expect(await db.select().from(nurseryRatings).where(eq(nurseryRatings.subjectId, numeracy!.id))).toHaveLength(6)
  })

  it('gives Sunrise its own partly filled sheet', async () => {
    expect(await db.select().from(scoreEntries).where(eq(scoreEntries.schoolId, ids.sunrise!))).toHaveLength(2 * 3)
  })

  it('is re-runnable without duplicates', async () => {
    const before = await count()
    await seed(db)
    expect(await count()).toEqual(before)
  })
})

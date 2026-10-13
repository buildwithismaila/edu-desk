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
  it('fills every JSS 1A subject except one English Exam, half of JSS 1B Maths and all of Primary 3A, within the component maxima', async () => {
    const rows = await db.select().from(scoreEntries).where(eq(scoreEntries.schoolId, ids.greenfield!))
    // JSS 1A: 10 subjects × 10 students × 3 components − Chidera's English Exam; JSS 1B: 4 of 8 students in Maths;
    // Primary 3A: 10 subjects × 8 students × 3 components
    expect(rows).toHaveLength(10 * 10 * 3 - 1 + 4 * 3 + 10 * 8 * 3)
    expect(rows.filter(r => r.absent)).toHaveLength(1)
    expect(rows.every(r => r.absent ? r.score === null : r.score! >= 0 && r.score! <= 60)).toBe(true)
  })

  it('rates all of JSS 1A and Primary 3A on every trait, with comments (principal\'s for half of JSS 1A and all of Primary 3A), and gives Nursery 1A Numeracy ratings', async () => {
    expect(await db.select().from(traitRatings).where(eq(traitRatings.schoolId, ids.greenfield!))).toHaveLength((10 + 8) * 10)
    const comments = await db.select().from(termComments).where(eq(termComments.schoolId, ids.greenfield!))
    expect(comments).toHaveLength(10 + 8)
    expect(comments.filter(c => c.principalComment)).toHaveLength(5 + 8)
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

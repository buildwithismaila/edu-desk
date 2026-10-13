import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { classArms, classLevels, publishedResults, resultStatuses, schools, students } from '~~/server/database/schema'
import { seed } from '~~/server/database/seed/seed'
import type { ReportCard } from '~~/server/services/results'
import type { Db } from '~~/server/utils/db'
import { createTestDb } from '../helpers/db'

let db: Db
let greenfield: string

beforeAll(async () => {
  db = await createTestDb()
  await seed(db)
  const [school] = await db.select({ id: schools.id }).from(schools).where(eq(schools.slug, 'greenfield'))
  greenfield = school!.id
})

const statusOf = async (level: string, arm: string) => {
  const [row] = await db.select({ status: resultStatuses.status })
    .from(resultStatuses)
    .innerJoin(classArms, eq(resultStatuses.classArmId, classArms.id))
    .innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(and(eq(resultStatuses.schoolId, greenfield), eq(classLevels.name, level), eq(classArms.name, arm)))
  return row?.status ?? 'draft'
}

describe('demo seed: results', () => {
  it('publishes Primary 3A (so Somto Eze has a report card) and leaves JSS 1A in Draft', async () => {
    expect(await statusOf('Primary 3', 'A')).toBe('published')
    expect(await statusOf('JSS 1', 'A')).toBe('draft')

    const cards = await db.select().from(publishedResults).where(eq(publishedResults.schoolId, greenfield))
    expect(cards).toHaveLength(8)
    const [somto] = await db.select({ id: students.id }).from(students).where(and(eq(students.schoolId, greenfield), eq(students.firstName, 'Somto')))
    const report = cards.find(c => c.studentId === somto!.id)!.report as ReportCard
    expect(report).toMatchObject({ status: 'published', student: { name: 'Somto Eze' }, arm: { label: 'Primary 3A' }, summary: { offered: 10, numberInClass: 8 } })
    expect(report.subjects.every(s => s.total !== null)).toBe(true)
    expect(report.comments.principal).toBeTruthy()
    expect(report.attendance.opened).toBeGreaterThan(0)
  })

  it('is re-runnable: still one card per student, still published', async () => {
    await seed(db)
    expect(await db.select().from(publishedResults).where(eq(publishedResults.schoolId, greenfield))).toHaveLength(8)
    expect(await statusOf('Primary 3', 'A')).toBe('published')
  })
})

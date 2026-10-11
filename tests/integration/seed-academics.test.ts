import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { academicSessions, classArms, classLevels, schools, subjects, terms } from '~~/server/database/schema'
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

async function current(schoolId: string) {
  const sessions = await db.select().from(academicSessions).where(and(eq(academicSessions.schoolId, schoolId), eq(academicSessions.isCurrent, true)))
  const currentTerms = await db.select().from(terms).where(and(eq(terms.schoolId, schoolId), eq(terms.isCurrent, true)))
  return { sessions, terms: currentTerms }
}

async function armsOf(schoolId: string, levelName: string) {
  const rows = await db.select({ name: classArms.name }).from(classArms)
    .innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(and(eq(classArms.schoolId, schoolId), eq(classLevels.name, levelName)))
  return rows.map(r => r.name).sort()
}

async function counts() {
  return {
    sessions: (await db.select().from(academicSessions)).length,
    terms: (await db.select().from(terms)).length,
    arms: (await db.select().from(classArms)).length,
    subjects: (await db.select().from(subjects)).length,
    levels: (await db.select().from(classLevels)).length,
  }
}

describe('demo seed: school setup', () => {
  it('fills in Greenfield\'s profile', async () => {
    const [greenfield] = await db.select().from(schools).where(eq(schools.slug, 'greenfield'))
    expect(greenfield).toMatchObject({ motto: expect.any(String), address: expect.stringContaining('Lagos'), showPositions: true })
    expect(greenfield!.phone).toMatch(/^\+234\d{10}$/)
  })

  it('makes 2026/2027 First Term current at Greenfield, with dates', async () => {
    const { sessions, terms: currentTerms } = await current(ids.greenfield!)

    expect(sessions.map(s => s.name)).toEqual(['2026/2027'])
    expect(currentTerms).toHaveLength(1)
    expect(currentTerms[0]).toMatchObject({ number: 'first', sessionId: sessions[0]!.id, startsOn: '2026-09-14', endsOn: '2026-12-18', nextTermBeginsOn: '2027-01-11' })
  })

  it('gives Greenfield a past session with three terms', async () => {
    const [past] = await db.select().from(academicSessions).where(and(eq(academicSessions.schoolId, ids.greenfield!), eq(academicSessions.name, '2025/2026')))
    const pastTerms = await db.select().from(terms).where(eq(terms.sessionId, past!.id))
    expect(past!.isCurrent).toBe(false)
    expect(pastTerms.map(t => t.number).sort()).toEqual(['first', 'second', 'third'])
  })

  it('gives each school its own arms', async () => {
    expect(await armsOf(ids.greenfield!, 'JSS 1')).toEqual(['A', 'B'])
    expect(await armsOf(ids.greenfield!, 'Nursery 1')).toEqual(['A'])
    expect(await armsOf(ids.sunrise!, 'JSS 1')).toEqual(['Diamond', 'Gold'])
  })

  it('gives Greenfield subjects per section, SSS ones by department', async () => {
    const rows = await db.select().from(subjects).where(eq(subjects.schoolId, ids.greenfield!))
    expect(rows.some(s => s.section === 'primary' && s.name === 'Mathematics')).toBe(true)
    expect(rows.some(s => s.section === 'jss' && s.name === 'Basic Technology')).toBe(true)
    const sss = rows.filter(s => s.section === 'sss')
    expect(sss.find(s => s.name === 'English Language')!.departmentId).toBeNull()
    expect(sss.find(s => s.name === 'Physics')!.departmentId).not.toBeNull()
  })

  it('leaves the suspended demo school without academics', async () => {
    const levels = await db.select().from(classLevels).where(eq(classLevels.schoolId, ids.hillside!))
    expect(levels).toEqual([])
  })

  it('is re-runnable: no duplicates, and the demo current term is restored', async () => {
    const before = await counts()
    const [past] = await db.select().from(academicSessions).where(and(eq(academicSessions.schoolId, ids.greenfield!), eq(academicSessions.name, '2025/2026')))
    await db.update(terms).set({ isCurrent: false }).where(eq(terms.schoolId, ids.greenfield!))
    await db.update(academicSessions).set({ isCurrent: false }).where(eq(academicSessions.schoolId, ids.greenfield!))
    await db.update(academicSessions).set({ isCurrent: true }).where(eq(academicSessions.id, past!.id))

    await seed(db)

    expect(await counts()).toEqual(before)
    const { sessions } = await current(ids.greenfield!)
    expect(sessions.map(s => s.name)).toEqual(['2026/2027'])
  })
})

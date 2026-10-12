import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { attendanceMarks, attendanceRegisters, classArms, classLevels, schools } from '~~/server/database/schema'
import { seed } from '~~/server/database/seed/seed'
import type { Db } from '~~/server/utils/db'
import { todayIn } from '~~/shared/utils/dates'
import { createTestDb } from '../helpers/db'

let db: Db
let ids: Record<string, string>

beforeAll(async () => {
  db = await createTestDb()
  await seed(db)
  const rows = await db.select({ id: schools.id, slug: schools.slug }).from(schools)
  ids = Object.fromEntries(rows.map(r => [r.slug, r.id]))
})

async function registersOf(schoolId: string) {
  return db.select({ id: attendanceRegisters.id, date: attendanceRegisters.date, level: classLevels.name, arm: classArms.name })
    .from(attendanceRegisters)
    .innerJoin(classArms, eq(attendanceRegisters.classArmId, classArms.id))
    .innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(eq(attendanceRegisters.schoolId, schoolId))
}

describe('demo seed: attendance', () => {
  it('gives Greenfield JSS 1A registers on past weekdays only (none for JSS 1B, none today)', async () => {
    const registers = await registersOf(ids.greenfield!)
    const today = todayIn('Africa/Lagos')

    expect(registers.length).toBeGreaterThan(0)
    expect(registers.length).toBeLessThanOrEqual(10)
    expect(new Set(registers.map(r => `${r.level}${r.arm}`))).toEqual(new Set(['JSS 1A']))
    for (const { date } of registers) {
      expect(date < today).toBe(true)
      expect([0, 6]).not.toContain(new Date(`${date}T00:00:00Z`).getUTCDay())
    }
  })

  it('marks every JSS 1A student on each register, with some absences and lates', async () => {
    const [register] = await registersOf(ids.greenfield!)
    expect(await db.select().from(attendanceMarks).where(eq(attendanceMarks.registerId, register!.id))).toHaveLength(10)

    const marks = await db.select({ status: attendanceMarks.status }).from(attendanceMarks).where(eq(attendanceMarks.schoolId, ids.greenfield!))
    const statuses = new Set(marks.map(m => m.status))
    expect(statuses).toEqual(new Set(['present', 'absent', 'late']))
  })

  it('gives Sunrise its own registers', async () => {
    const registers = await registersOf(ids.sunrise!)
    expect(registers.length).toBeGreaterThan(0)
    expect(new Set(registers.map(r => `${r.level} ${r.arm}`))).toEqual(new Set(['JSS 1 Gold']))
  })

  it('is re-runnable without duplicates', async () => {
    const before = (await db.select().from(attendanceRegisters)).length
    const marksBefore = (await db.select().from(attendanceMarks)).length

    await seed(db)

    expect(await db.select().from(attendanceRegisters)).toHaveLength(before)
    expect(await db.select().from(attendanceMarks)).toHaveLength(marksBefore)
    const [jss1a] = await registersOf(ids.greenfield!)
    expect(await db.select().from(attendanceRegisters).where(and(eq(attendanceRegisters.id, jss1a!.id)))).toHaveLength(1)
  })
})

import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { classArms, classLevels, classTeacherAssignments, schools, subjects, subjectTeacherAssignments, users } from '~~/server/database/schema'
import { seed } from '~~/server/database/seed/seed'
import type { Db } from '~~/server/utils/db'
import { createTestDb } from '../helpers/db'

let db: Db
let greenfieldId: string

beforeAll(async () => {
  db = await createTestDb()
  await seed(db)
  const [greenfield] = await db.select().from(schools).where(eq(schools.slug, 'greenfield'))
  greenfieldId = greenfield!.id
})

/** "JSS 1A"-style labels of the arms a teacher is class teacher of. */
async function classTeacherOf(email: string) {
  const rows = await db.select({ level: classLevels.name, arm: classArms.name })
    .from(classTeacherAssignments)
    .innerJoin(users, eq(classTeacherAssignments.userId, users.id))
    .innerJoin(classArms, eq(classTeacherAssignments.classArmId, classArms.id))
    .innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(and(eq(users.schoolId, greenfieldId), eq(users.email, email)))
  return rows.map(r => `${r.level}${r.arm}`).sort()
}

async function teaches(email: string) {
  const rows = await db.select({ subject: subjects.name, level: classLevels.name, arm: classArms.name })
    .from(subjectTeacherAssignments)
    .innerJoin(users, eq(subjectTeacherAssignments.userId, users.id))
    .innerJoin(subjects, eq(subjectTeacherAssignments.subjectId, subjects.id))
    .innerJoin(classArms, eq(subjectTeacherAssignments.classArmId, classArms.id))
    .innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(and(eq(users.schoolId, greenfieldId), eq(users.email, email)))
  return rows.map(r => `${r.subject} ${r.level}${r.arm}`).sort()
}

describe('demo seed: staff and assignments', () => {
  it('adds more Greenfield teachers, one forced to change password', async () => {
    const teachers = await db.select().from(users).where(and(eq(users.schoolId, greenfieldId), eq(users.role, 'teacher')))
    expect(teachers.map(t => t.email).sort()).toEqual([
      'chioma@greenfield.test', 'grace@greenfield.test', 'ibrahim@greenfield.test', 'inactive@greenfield.test',
      'kemi@greenfield.test', 'teacher@greenfield.test', 'yusuf@greenfield.test',
    ])
    expect(teachers.find(t => t.email === 'kemi@greenfield.test')!.mustChangePassword).toBe(true)
    expect(teachers.find(t => t.email === 'chioma@greenfield.test')!.phone).toMatch(/^\+234\d{10}$/)
  })

  it('assigns class and subject teachers for 2026/2027', async () => {
    expect(await classTeacherOf('teacher@greenfield.test')).toEqual(['JSS 1A'])
    expect(await teaches('teacher@greenfield.test')).toEqual(['Mathematics JSS 1A', 'Mathematics JSS 1B'])
    expect(await classTeacherOf('chioma@greenfield.test')).toEqual(['JSS 1B'])
    expect(await teaches('chioma@greenfield.test')).toEqual(['English Language JSS 1A', 'English Language JSS 1B'])
    expect(await teaches('yusuf@greenfield.test')).toEqual(['Physics SSS 1A', 'Physics SSS 1B'])
    expect(await classTeacherOf('grace@greenfield.test')).toEqual(['Primary 3A'])
    expect(await teaches('principal@greenfield.test')).toEqual(['Civic Education SSS 1A'])
  })

  it('leaves Ibrahim and the rest of the arms unassigned, so gaps show', async () => {
    expect(await classTeacherOf('ibrahim@greenfield.test')).toEqual([])
    expect(await teaches('ibrahim@greenfield.test')).toEqual([])
  })

  it('is re-runnable without duplicating staff or assignments', async () => {
    const count = async () => ({
      users: (await db.select().from(users)).length,
      classTeachers: (await db.select().from(classTeacherAssignments)).length,
      subjectTeachers: (await db.select().from(subjectTeacherAssignments)).length,
    })
    const before = await count()

    await seed(db)

    expect(await count()).toEqual(before)
  })
})

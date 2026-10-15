import { and, eq, isNull } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { admissionCounters, classArms, classLevels, schools, studentEnrolments, studentGuardians, students, users } from '~~/server/database/schema'
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

async function enrolledIn(schoolId: string) {
  const rows = await db.select({ level: classLevels.name, arm: classArms.name })
    .from(studentEnrolments)
    .innerJoin(classArms, eq(studentEnrolments.classArmId, classArms.id))
    .innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(eq(studentEnrolments.schoolId, schoolId))
  const counts: Record<string, number> = {}
  for (const r of rows) counts[`${r.level}${r.arm}`] = (counts[`${r.level}${r.arm}`] ?? 0) + 1
  return counts
}

const count = async () => ({
  students: (await db.select().from(students)).length,
  enrolments: (await db.select().from(studentEnrolments)).length,
  links: (await db.select().from(studentGuardians)).length,
  parents: (await db.select().from(users).where(eq(users.role, 'parent'))).length,
})

describe('demo seed: students and guardians', () => {
  it('admits 43 Greenfield students across sections with GFA numbers', async () => {
    expect(await enrolledIn(ids.greenfield!)).toEqual({ 'JSS 1A': 10, 'JSS 1B': 8, 'Primary 3A': 8, 'SSS 1A': 8, 'Nursery 1A': 6, 'SSS 3A': 3 })

    const greenfield = await db.select().from(students).where(eq(students.schoolId, ids.greenfield!))
    expect(greenfield.map(s => s.admissionNumber).sort()[0]).toBe('GFA/2026/0001')
    expect(greenfield.every(s => /^GFA\/2026\/\d{4}$/.test(s.admissionNumber))).toBe(true)
    const [counter] = await db.select().from(admissionCounters).where(and(eq(admissionCounters.schoolId, ids.greenfield!), eq(admissionCounters.year, 2026)))
    expect(counter!.lastNumber).toBe(43)
  })

  it('gives SSS students departments and nobody else', async () => {
    const rows = await db.select({ dept: students.departmentId, level: classLevels.section })
      .from(students)
      .innerJoin(studentEnrolments, eq(studentEnrolments.studentId, students.id))
      .innerJoin(classArms, eq(studentEnrolments.classArmId, classArms.id))
      .innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
      .where(eq(students.schoolId, ids.greenfield!))
    expect(rows.filter(r => r.level === 'sss').every(r => r.dept)).toBe(true)
    expect(rows.filter(r => r.level !== 'sss').every(r => !r.dept)).toBe(true)
  })

  it('makes Ngozi Eze (parent@greenfield.test) the mother of two siblings in different classes', async () => {
    const [ngozi] = await db.select().from(users).where(and(eq(users.schoolId, ids.greenfield!), eq(users.email, 'parent@greenfield.test')))
    expect(ngozi!.phone).toBe('+2348031110001')

    const children = await db.select({ lastName: students.lastName, relationship: studentGuardians.relationship })
      .from(studentGuardians).innerJoin(students, eq(studentGuardians.studentId, students.id))
      .where(eq(studentGuardians.guardianId, ngozi!.id))
    expect(children).toHaveLength(2)
    expect(children.every(c => c.lastName === 'Eze' && c.relationship === 'mother')).toBe(true)
  })

  it('has a student with two guardians and at least one phone-only guardian', async () => {
    const links = await db.select({ studentId: studentGuardians.studentId }).from(studentGuardians).where(eq(studentGuardians.schoolId, ids.greenfield!))
    const perStudent = new Map<string, number>()
    for (const l of links) perStudent.set(l.studentId, (perStudent.get(l.studentId) ?? 0) + 1)
    expect([...perStudent.values()].some(n => n === 2)).toBe(true)
    expect([...perStudent.values()].every(n => n >= 1)).toBe(true)

    const phoneOnly = await db.select().from(users).where(and(eq(users.schoolId, ids.greenfield!), eq(users.role, 'parent'), isNull(users.email)))
    expect(phoneOnly.length).toBeGreaterThan(0)
  })

  it('gives Sunrise its own three students', async () => {
    expect(await enrolledIn(ids.sunrise!)).toEqual({ 'JSS 1Gold': 3 })
  })

  it('is re-runnable', async () => {
    const before = await count()
    await seed(db)
    expect(await count()).toEqual(before)
  })
})

describe('demo seed: parent logins and invoices (Phase 10a)', () => {
  it('leaves the Primary 3A parents without a login, except the demo parent', async () => {
    const parents = await db.selectDistinct({ id: users.id, email: users.email, mustChangePassword: users.mustChangePassword, temporaryPasswordAt: users.temporaryPasswordAt })
      .from(studentGuardians)
      .innerJoin(users, eq(studentGuardians.guardianId, users.id))
      .innerJoin(studentEnrolments, eq(studentEnrolments.studentId, studentGuardians.studentId))
      .innerJoin(classArms, eq(studentEnrolments.classArmId, classArms.id))
      .innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
      .where(and(eq(studentGuardians.schoolId, ids.greenfield!), eq(classLevels.name, 'Primary 3'), eq(classArms.name, 'A')))
    const demo = parents.filter(p => p.email === 'parent@greenfield.test')
    const others = parents.filter(p => p.email !== 'parent@greenfield.test')
    expect(demo).toEqual([{ id: expect.any(String), email: 'parent@greenfield.test', mustChangePassword: false, temporaryPasswordAt: null }])
    expect(others.length).toBe(7)
    expect(others.every(p => p.mustChangePassword && p.temporaryPasswordAt === null)).toBe(true)
  })

  it('gives Greenfield two bank accounts for its invoices', async () => {
    const [greenfield] = await db.select({ bankAccounts: schools.bankAccounts }).from(schools).where(eq(schools.id, ids.greenfield!))
    expect(greenfield!.bankAccounts).toHaveLength(2)
    expect(greenfield!.bankAccounts.every(a => /^\d{10}$/.test(a.accountNumber))).toBe(true)
  })
})

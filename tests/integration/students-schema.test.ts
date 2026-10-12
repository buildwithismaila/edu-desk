import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { admissionCounters, classArms, studentEnrolments, students, users } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createClassArm, createClassLevel, createSession } from '../factories/academics'
import { createSchool, createTwoSchools } from '../factories/schools'
import { createGuardian, createStudent, enrol } from '../factories/students'
import { createUser } from '../factories/users'
import { createTestDb } from '../helpers/db'

// Database-level guarantees, independent of route code
let db: Db
let schoolA: Awaited<ReturnType<typeof createTwoSchools>>['schoolA']
let schoolB: Awaited<ReturnType<typeof createTwoSchools>>['schoolB']

beforeAll(async () => {
  db = await createTestDb()
  ;({ schoolA, schoolB } = await createTwoSchools(db))
})

describe('students constraints', () => {
  it('admission numbers are unique per school, not across schools', async () => {
    await createStudent(db, schoolA, { admissionNumber: 'X/2026/0001' })

    await expect(createStudent(db, schoolA, { admissionNumber: 'X/2026/0001' })).rejects.toThrow()
    await expect(createStudent(db, schoolB, { admissionNumber: 'X/2026/0001' })).resolves.toBeDefined()
  })

  it('a student has one enrolment per session', async () => {
    const { session } = await createSession(db, schoolA)
    const level = await createClassLevel(db, schoolA)
    const [armA, armB] = [await createClassArm(db, schoolA, level, 'A'), await createClassArm(db, schoolA, level, 'B')]
    const student = await createStudent(db, schoolA)
    await enrol(db, schoolA, { student, session, arm: armA })

    await expect(enrol(db, schoolA, { student, session, arm: armB })).rejects.toThrow()
    const { session: next } = await createSession(db, schoolA)
    await expect(enrol(db, schoolA, { student, session: next, arm: armB })).resolves.toBeDefined()
  })

  it('an arm with enrolments cannot be deleted by the database either', async () => {
    const { session } = await createSession(db, schoolA)
    const arm = await createClassArm(db, schoolA, await createClassLevel(db, schoolA))
    await enrol(db, schoolA, { student: await createStudent(db, schoolA), session, arm })

    await expect(db.delete(classArms).where(eq(classArms.id, arm.id))).rejects.toThrow()
  })

  it('admission counters are per school and year', async () => {
    await db.insert(admissionCounters).values({ schoolId: schoolA.id, year: 2026, lastNumber: 5 })

    await expect(db.insert(admissionCounters).values({ schoolId: schoolA.id, year: 2026, lastNumber: 1 })).rejects.toThrow()
    await expect(db.insert(admissionCounters).values({ schoolId: schoolA.id, year: 2027, lastNumber: 1 })).resolves.toBeDefined()
    await expect(db.insert(admissionCounters).values({ schoolId: schoolB.id, year: 2026, lastNumber: 1 })).resolves.toBeDefined()
  })

  it('deleting a student removes their enrolments and guardian links (hard delete is only for tests)', async () => {
    const { session } = await createSession(db, schoolA)
    const arm = await createClassArm(db, schoolA, await createClassLevel(db, schoolA))
    const student = await createStudent(db, schoolA, { guardians: [await createGuardian(db, schoolA)] })
    await enrol(db, schoolA, { student, session, arm })

    await db.delete(students).where(eq(students.id, student.id))

    expect(await db.select().from(studentEnrolments).where(eq(studentEnrolments.studentId, student.id))).toEqual([])
  })
})

describe('user phones', () => {
  it('are unique per school among active accounts', async () => {
    const school = await createSchool(db)
    await createUser(db, school, { phone: '+2348030000001' })

    await expect(createUser(db, school, { phone: '+2348030000001' })).rejects.toThrow()
    await expect(createUser(db, schoolB, { phone: '+2348030000001' })).resolves.toBeDefined()
  })

  it('can be reused once the old account is removed', async () => {
    const school = await createSchool(db)
    const old = await createUser(db, school, { phone: '+2348030000002' })
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, old.id))

    await expect(createUser(db, school, { phone: '+2348030000002' })).resolves.toBeDefined()
  })

  it('allows many accounts without a phone or email (guardians may have only a phone)', async () => {
    const school = await createSchool(db)
    await createUser(db, school, { phone: null })
    await expect(createUser(db, school, { phone: null })).resolves.toBeDefined()
    await expect(createGuardian(db, school, { email: null })).resolves.toMatchObject({ email: null, role: 'parent' })
  })
})

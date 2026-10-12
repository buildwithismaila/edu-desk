import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { academicSessions, classArms, classTeacherAssignments, subjects, subjectTeacherAssignments, users } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { assignClassTeacher, assignSubjectTeacher, createClassArm, createClassLevel, createSession, createSubject } from '../factories/academics'
import { createTwoSchools } from '../factories/schools'
import { createUser } from '../factories/users'
import { createTestDb } from '../helpers/db'

// Database-level guarantees for assignments, independent of route code
let db: Db
let schoolA: Awaited<ReturnType<typeof createTwoSchools>>['schoolA']

beforeAll(async () => {
  db = await createTestDb()
  ;({ schoolA } = await createTwoSchools(db))
})

async function fixture() {
  const { session } = await createSession(db, schoolA)
  const level = await createClassLevel(db, schoolA, { section: 'jss' })
  const arm = await createClassArm(db, schoolA, level, 'A')
  const subject = await createSubject(db, schoolA, { section: 'jss' })
  const teacher = await createUser(db, schoolA, { role: 'teacher' })
  const other = await createUser(db, schoolA, { role: 'teacher' })
  return { session, level, arm, subject, teacher, other }
}

describe('assignment constraints', () => {
  it('allows one class teacher per arm per session', async () => {
    const { session, arm, teacher, other } = await fixture()
    await assignClassTeacher(db, schoolA, { session, arm, user: teacher })

    await expect(assignClassTeacher(db, schoolA, { session, arm, user: other })).rejects.toThrow()
  })

  it('allows the same arm a class teacher in each session', async () => {
    const { session, arm, teacher } = await fixture()
    const { session: next } = await createSession(db, schoolA)
    await assignClassTeacher(db, schoolA, { session, arm, user: teacher })

    await expect(assignClassTeacher(db, schoolA, { session: next, arm, user: teacher })).resolves.toBeDefined()
  })

  it('allows one teacher per subject per arm per session', async () => {
    const { session, arm, subject, teacher, other } = await fixture()
    await assignSubjectTeacher(db, schoolA, { session, arm, subject, user: teacher })

    await expect(assignSubjectTeacher(db, schoolA, { session, arm, subject, user: other })).rejects.toThrow()
  })

  it('lets one teacher teach several subjects and arms', async () => {
    const { session, level, arm, subject, teacher } = await fixture()
    const armB = await createClassArm(db, schoolA, level, 'B')
    const subject2 = await createSubject(db, schoolA, { section: 'jss' })

    await assignSubjectTeacher(db, schoolA, { session, arm, subject, user: teacher })
    await assignSubjectTeacher(db, schoolA, { session, arm, subject: subject2, user: teacher })
    await expect(assignSubjectTeacher(db, schoolA, { session, arm: armB, subject, user: teacher })).resolves.toBeDefined()
  })

  it.each([
    ['session', async (f: Awaited<ReturnType<typeof fixture>>) => db.delete(academicSessions).where(eq(academicSessions.id, f.session.id))],
    ['arm', async (f: Awaited<ReturnType<typeof fixture>>) => db.delete(classArms).where(eq(classArms.id, f.arm.id))],
  ])('deleting the %s removes its assignments', async (_case, remove) => {
    const f = await fixture()
    const ct = await assignClassTeacher(db, schoolA, { session: f.session, arm: f.arm, user: f.teacher })
    const st = await assignSubjectTeacher(db, schoolA, { session: f.session, arm: f.arm, subject: f.subject, user: f.teacher })

    await remove(f)

    expect(await db.select().from(classTeacherAssignments).where(eq(classTeacherAssignments.id, ct.id))).toEqual([])
    expect(await db.select().from(subjectTeacherAssignments).where(eq(subjectTeacherAssignments.id, st.id))).toEqual([])
  })

  it('deleting a subject removes its subject assignments', async () => {
    const f = await fixture()
    const st = await assignSubjectTeacher(db, schoolA, { session: f.session, arm: f.arm, subject: f.subject, user: f.teacher })

    await db.delete(subjects).where(eq(subjects.id, f.subject.id))

    expect(await db.select().from(subjectTeacherAssignments).where(eq(subjectTeacherAssignments.id, st.id))).toEqual([])
  })

  it('refuses to hard-delete a user who has assignments', async () => {
    const f = await fixture()
    await assignClassTeacher(db, schoolA, { session: f.session, arm: f.arm, user: f.teacher })

    await expect(db.delete(users).where(eq(users.id, f.teacher.id))).rejects.toThrow()
  })
})

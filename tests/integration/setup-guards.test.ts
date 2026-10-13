import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { academicSessions, assessmentComponents, classArms, studentEnrolments, subjects } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createClassArm, createClassLevel, createSession, createSubject } from '../factories/academics'
import { createSchool } from '../factories/schools'
import { createRegister } from '../factories/attendance'
import { createAssessmentComponents, createScore } from '../factories/scores'
import { createStudent, enrol } from '../factories/students'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'

// Phase 2 deletes that would lose student history (promised in docs/features/02-school-setup.md)
let db: Db
let app: ReturnType<typeof createTestApp>

beforeAll(async () => {
  db = await createTestDb()
})

beforeEach(() => {
  app = createTestApp(db)
})

async function adminOf(school: { id: string, slug: string }) {
  const admin = await createUser(db, school, { role: 'admin' })
  return app.login(`${school.slug}.lvh.me:3000`, admin.email!, DEFAULT_TEST_PASSWORD)
}

const del = (school: { slug: string }, path: string, cookie: string) =>
  app.request(path, { host: `${school.slug}.lvh.me:3000`, cookie, method: 'DELETE' })

describe('deletes blocked by enrolments', () => {
  it('refuses to delete a class arm with enrolled students (409), allows it once empty', async () => {
    const school = await createSchool(db)
    const cookie = await adminOf(school)
    const { session } = await createSession(db, school)
    const arm = await createClassArm(db, school, await createClassLevel(db, school))
    await enrol(db, school, { student: await createStudent(db, school), session, arm })

    const res = await del(school, `/api/class-arms/${arm.id}`, cookie)
    expect(res.status).toBe(409)
    expect((await res.json()).message).toMatch(/students/)
    expect(await db.select().from(classArms).where(eq(classArms.id, arm.id))).toHaveLength(1)

    const empty = await createClassArm(db, school, await createClassLevel(db, school))
    expect((await del(school, `/api/class-arms/${empty.id}`, cookie)).status).toBe(200)
  })

  it('refuses to delete a session with enrolments (409)', async () => {
    const school = await createSchool(db)
    const cookie = await adminOf(school)
    const { session } = await createSession(db, school)
    const arm = await createClassArm(db, school, await createClassLevel(db, school))
    await enrol(db, school, { student: await createStudent(db, school), session, arm })

    const res = await del(school, `/api/sessions/${session.id}`, cookie)
    expect(res.status).toBe(409)
    expect((await res.json()).message).toMatch(/students/)
    expect(await db.select().from(academicSessions).where(eq(academicSessions.id, session.id))).toHaveLength(1)
  })
})

describe('deletes blocked by attendance', () => {
  it('refuses to delete a class arm with registers, even after its students moved (409)', async () => {
    const school = await createSchool(db)
    const cookie = await adminOf(school)
    const { session, terms } = await createSession(db, school)
    const level = await createClassLevel(db, school)
    const arm = await createClassArm(db, school, level)
    const other = await createClassArm(db, school, level, 'B')
    const student = await createStudent(db, school)
    await enrol(db, school, { student, session, arm })
    await createRegister(db, school, { term: terms[0]!, arm, date: '2026-10-12', marks: [{ student, status: 'present' }] })
    await db.update(studentEnrolments).set({ classArmId: other.id }).where(eq(studentEnrolments.studentId, student.id))

    const res = await del(school, `/api/class-arms/${arm.id}`, cookie)
    expect(res.status).toBe(409)
    expect((await res.json()).message).toMatch(/attendance/)
    expect(await db.select().from(classArms).where(eq(classArms.id, arm.id))).toHaveLength(1)
  })

  it('refuses to delete a session with registers (409)', async () => {
    const school = await createSchool(db)
    const cookie = await adminOf(school)
    const { session, terms } = await createSession(db, school)
    const arm = await createClassArm(db, school, await createClassLevel(db, school))
    await createRegister(db, school, { term: terms[1]!, arm, date: '2026-10-12' })

    const res = await del(school, `/api/sessions/${session.id}`, cookie)
    expect(res.status).toBe(409)
    expect((await res.json()).message).toMatch(/attendance/)
    expect(await db.select().from(academicSessions).where(eq(academicSessions.id, session.id))).toHaveLength(1)
  })
})

describe('deletes and changes blocked by scores', () => {
  async function scored() {
    const school = await createSchool(db)
    const cookie = await adminOf(school)
    const { session, terms } = await createSession(db, school)
    const subject = await createSubject(db, school)
    const [component] = await createAssessmentComponents(db, school)
    await createScore(db, school, { term: terms[0]!, student: await createStudent(db, school), subject, component: component!, score: 15 })
    return { school, cookie, session, subject }
  }

  it('refuses to delete a subject with scores (409)', async () => {
    const { school, cookie, subject } = await scored()
    const res = await del(school, `/api/subjects/${subject.id}`, cookie)
    expect(res.status).toBe(409)
    expect((await res.json()).message).toMatch(/scores/)
    expect(await db.select().from(subjects).where(eq(subjects.id, subject.id))).toHaveLength(1)
  })

  it('refuses to delete a session with scores (409)', async () => {
    const { school, cookie, session } = await scored()
    const res = await del(school, `/api/sessions/${session.id}`, cookie)
    expect(res.status).toBe(409)
    expect((await res.json()).message).toMatch(/scores/)
    expect(await db.select().from(academicSessions).where(eq(academicSessions.id, session.id))).toHaveLength(1)
  })

  it('freezes the assessment split once scores exist (409), but not before', async () => {
    const split = { components: [{ name: 'CA', maxScore: 40 }, { name: 'Exam', maxScore: 60 }] }
    const put = (school: { slug: string }, cookie: string) => app.request('/api/assessment-components', {
      host: `${school.slug}.lvh.me:3000`, cookie, method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(split),
    })

    const { school, cookie } = await scored()
    const res = await put(school, cookie)
    expect(res.status).toBe(409)
    expect((await res.json()).message).toBe('Scores have already been entered with this split, so it can\'t be changed.')
    expect((await db.select().from(assessmentComponents).where(eq(assessmentComponents.schoolId, school.id))).map(c => c.name)).toEqual(['CA1', 'CA2', 'Exam'])

    const fresh = await createSchool(db)
    expect((await put(fresh, await adminOf(fresh))).status).toBe(200)
  })
})

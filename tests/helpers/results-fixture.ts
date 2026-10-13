import { eq } from 'drizzle-orm'
import { DEFAULT_GRADE_BANDS } from '~~/shared/constants/academics'
import { gradeBands, terms } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { assignClassTeacher, assignSubjectTeacher, createClassArm, createClassLevel, createSession, createSubject } from '../factories/academics'
import { createSchool } from '../factories/schools'
import { createAssessmentComponents, createScore } from '../factories/scores'
import { createGuardian, createStudent, enrol } from '../factories/students'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import type { createTestApp } from './app'

export const hostOf = (slug: string) => `${slug}.lvh.me:3000`

export type ResultsRole = 'admin' | 'principal' | 'classTeacher' | 'otherTeacher' | 'subjectTeacher' | 'bursar' | 'parent'

type Cell = number | 'ABS' | undefined

/**
 * A school with the current first term (next term begins 11/01/2027), the default split and JSS bands;
 * JSS 1A (Ada, Bola, Chidi; class teacher, Maths subject teacher) and JSS 1B (Dayo; its own class teacher);
 * Ada's and Dayo's parents. First-term scores (hand-calculated):
 *   Ada   Maths 15+12+50 = 77, English 10+10+40 = 60 → 137 / 2 = 68.5 → 2nd (tie)
 *   Bola  Maths 10+ABS+30 = 40, English 20+20+57 = 97 → 137 / 2 = 68.5 → 2nd (tie)
 *   Chidi Maths 20+20+50 = 90, English 18+18+54 = 90 → 180 / 2 = 90   → 1st
 * `complete: false` leaves out Chidi's English Exam.
 */
export async function resultsFixture(db: Db, app: ReturnType<typeof createTestApp>, { complete = true } = {}) {
  const school = await createSchool(db, { address: '1 School Road, Lagos', motto: 'Knowledge is light' })
  const { session, terms: sessionTerms } = await createSession(db, school, { currentTerm: 'first' })
  const first = sessionTerms.find(t => t.number === 'first')!
  const second = sessionTerms.find(t => t.number === 'second')!
  const third = sessionTerms.find(t => t.number === 'third')!
  await db.update(terms).set({ nextTermBeginsOn: '2027-01-11' }).where(eq(terms.id, first.id))
  const [ca1, ca2, exam] = (await createAssessmentComponents(db, school)).map(c => ({ id: c.id })) as [{ id: string }, { id: string }, { id: string }]
  await db.insert(gradeBands).values(DEFAULT_GRADE_BANDS.jss.map((b, i) => ({ ...b, schoolId: school.id, section: 'jss' as const, sortOrder: i })))

  const level = await createClassLevel(db, school, { section: 'jss', name: 'JSS 1' })
  const armA = await createClassArm(db, school, level, 'A')
  const armB = await createClassArm(db, school, level, 'B')
  const maths = await createSubject(db, school, { section: 'jss', name: 'Mathematics' })
  const english = await createSubject(db, school, { section: 'jss', name: 'English Language' })

  const adaParent = await createGuardian(db, school)
  const dayoParent = await createGuardian(db, school)
  const ada = await createStudent(db, school, { firstName: 'Ada', lastName: 'Obi', guardians: [adaParent] })
  const bola = await createStudent(db, school, { firstName: 'Bola', lastName: 'Ade' })
  const chidi = await createStudent(db, school, { firstName: 'Chidi', lastName: 'Eze' })
  const dayo = await createStudent(db, school, { firstName: 'Dayo', lastName: 'Lawal', guardians: [dayoParent] })
  for (const student of [ada, bola, chidi]) await enrol(db, school, { student, session, arm: armA })
  await enrol(db, school, { student: dayo, session, arm: armB })

  const scores = async (term: { id: string }, student: { id: string }, subject: { id: string }, cells: [Cell, Cell, Cell]) => {
    for (const [i, value] of cells.entries()) {
      if (value === undefined) continue
      await createScore(db, school, { term, student, subject, component: [ca1, ca2, exam][i]!, score: value === 'ABS' ? null : value, absent: value === 'ABS' })
    }
  }
  await scores(first, ada, maths, [15, 12, 50])
  await scores(first, ada, english, [10, 10, 40])
  await scores(first, bola, maths, [10, 'ABS', 30])
  await scores(first, bola, english, [20, 20, 57])
  await scores(first, chidi, maths, [20, 20, 50])
  await scores(first, chidi, english, [18, 18, complete ? 54 : undefined])

  const users = {
    admin: await createUser(db, school, { role: 'admin' }),
    principal: await createUser(db, school, { role: 'principal', name: 'Emeka Nwosu' }),
    classTeacher: await createUser(db, school, { role: 'teacher', name: 'Tunde Adeyemi' }),
    otherTeacher: await createUser(db, school, { role: 'teacher' }),
    subjectTeacher: await createUser(db, school, { role: 'teacher' }),
    bursar: await createUser(db, school, { role: 'bursar' }),
  }
  await assignClassTeacher(db, school, { session, arm: armA, user: users.classTeacher })
  await assignClassTeacher(db, school, { session, arm: armB, user: users.otherTeacher })
  await assignSubjectTeacher(db, school, { session, arm: armA, user: users.subjectTeacher, subject: maths })

  const cookies = {} as Record<ResultsRole | 'dayoParent', string>
  for (const [role, user] of Object.entries(users)) cookies[role as ResultsRole] = await app.login(hostOf(school.slug), user.email!, DEFAULT_TEST_PASSWORD)
  cookies.parent = await app.login(hostOf(school.slug), adaParent.email!, DEFAULT_TEST_PASSWORD)
  cookies.dayoParent = await app.login(hostOf(school.slug), dayoParent.email!, DEFAULT_TEST_PASSWORD)

  return {
    school, session, first, second, third, components: { ca1, ca2, exam }, level, armA, armB, maths, english,
    students: { ada, bola, chidi, dayo }, parents: { ada: adaParent, dayo: dayoParent }, users, cookies, scores,
  }
}
export type ResultsFixture = Awaited<ReturnType<typeof resultsFixture>>

/** Request helpers bound to a fixture's host. */
export function resultsRequests(app: ReturnType<typeof createTestApp>) {
  const send = (method: string) => (f: ResultsFixture, cookie: string | undefined, path: string, body?: unknown) => app.request(path, {
    host: hostOf(f.school.slug),
    cookie,
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  return { get: send('GET'), post: send('POST'), put: send('PUT'), del: send('DELETE') }
}

export const armQuery = (f: ResultsFixture, arm = f.armA, term = f.first) => `termId=${term.id}&classArmId=${arm.id}`
export const armBody = (f: ResultsFixture, arm = f.armA, term = f.first) => ({ termId: term.id, classArmId: arm.id })

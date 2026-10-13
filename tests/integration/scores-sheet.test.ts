import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_GRADE_BANDS } from '~~/shared/constants/academics'
import { gradeBands, nurseryRatings, scoreEntries, scoreLocks } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { assignClassTeacher, assignSubjectTeacher, createClassArm, createClassLevel, createDepartment, createSession, createSubject } from '../factories/academics'
import { createSchool } from '../factories/schools'
import { createAssessmentComponents } from '../factories/scores'
import { createStudent, enrol } from '../factories/students'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'

let db: Db
let app: ReturnType<typeof createTestApp>

const hostOf = (slug: string) => `${slug}.lvh.me:3000`

beforeAll(async () => {
  db = await createTestDb()
  app = createTestApp(db)
})

type Role = 'admin' | 'principal' | 'mathsTeacher' | 'englishTeacher' | 'classTeacher' | 'bursar' | 'parent'

/**
 * A school with a current first term (and an earlier session), the default split and JSS bands;
 * JSS 1A (Ada, Bola, Chidi) with Mathematics and English teachers and a class teacher; SSS 1A
 * (Science, Arts, no department) with Physics (Science) and English (core); Nursery 1A with Numeracy.
 */
async function setup() {
  const school = await createSchool(db)
  const { session, terms } = await createSession(db, school, { currentTerm: 'first' })
  const { terms: oldTerms } = await createSession(db, school)
  const first = terms.find(t => t.number === 'first')!
  const second = terms.find(t => t.number === 'second')!
  const components = await createAssessmentComponents(db, school)
  await db.insert(gradeBands).values(DEFAULT_GRADE_BANDS.jss.map((b, i) => ({ ...b, schoolId: school.id, section: 'jss' as const, sortOrder: i })))

  const jss1a = await createClassArm(db, school, await createClassLevel(db, school, { section: 'jss', name: 'JSS 1' }), 'A')
  const sss1a = await createClassArm(db, school, await createClassLevel(db, school, { section: 'sss', name: 'SSS 1' }), 'A')
  const nursery1a = await createClassArm(db, school, await createClassLevel(db, school, { section: 'nursery', name: 'Nursery 1' }), 'A')
  const science = await createDepartment(db, school, 'Science')
  const arts = await createDepartment(db, school, 'Arts')
  const maths = await createSubject(db, school, { section: 'jss', name: 'Mathematics' })
  const english = await createSubject(db, school, { section: 'jss', name: 'English Language' })
  const physics = await createSubject(db, school, { section: 'sss', name: 'Physics', departmentId: science.id })
  const sssEnglish = await createSubject(db, school, { section: 'sss', name: 'English Language' })
  const numeracy = await createSubject(db, school, { section: 'nursery', name: 'Numeracy' })

  const jss = [
    await createStudent(db, school, { firstName: 'Ada', lastName: 'Obi' }),
    await createStudent(db, school, { firstName: 'Bola', lastName: 'Ade' }),
    await createStudent(db, school, { firstName: 'Chidi', lastName: 'Eze' }),
  ]
  for (const student of jss) await enrol(db, school, { student, session, arm: jss1a })
  const sss = {
    scientist: await createStudent(db, school, { firstName: 'Sola', lastName: 'Science', departmentId: science.id }),
    artist: await createStudent(db, school, { firstName: 'Amaka', lastName: 'Arts', departmentId: arts.id }),
    undecided: await createStudent(db, school, { firstName: 'Nkem', lastName: 'None' }),
  }
  for (const student of Object.values(sss)) await enrol(db, school, { student, session, arm: sss1a })
  const tots = [await createStudent(db, school), await createStudent(db, school)]
  for (const student of tots) await enrol(db, school, { student, session, arm: nursery1a })

  const users = {
    admin: await createUser(db, school, { role: 'admin' }),
    principal: await createUser(db, school, { role: 'principal' }),
    mathsTeacher: await createUser(db, school, { role: 'teacher' }),
    englishTeacher: await createUser(db, school, { role: 'teacher' }),
    classTeacher: await createUser(db, school, { role: 'teacher' }),
    bursar: await createUser(db, school, { role: 'bursar' }),
    parent: await createUser(db, school, { role: 'parent' }),
  }
  await assignSubjectTeacher(db, school, { session, arm: jss1a, user: users.mathsTeacher, subject: maths })
  await assignSubjectTeacher(db, school, { session, arm: jss1a, user: users.englishTeacher, subject: english })
  await assignClassTeacher(db, school, { session, arm: jss1a, user: users.classTeacher })

  const cookies = {} as Record<Role, string>
  for (const [role, user] of Object.entries(users)) cookies[role as Role] = await app.login(hostOf(school.slug), user.email!, DEFAULT_TEST_PASSWORD)
  const [ca1, ca2, exam] = components as [typeof components[number], typeof components[number], typeof components[number]]
  return {
    school, session, first, second, oldTerm: oldTerms[0]!, ca1, ca2, exam,
    jss1a, sss1a, nursery1a, maths, english, physics, sssEnglish, numeracy, jss, sss, tots, users, cookies,
  }
}
type Fixture = Awaited<ReturnType<typeof setup>>

const sheetQuery = (q: { termId?: string, classArmId: string, subjectId: string }) =>
  new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]).toString()
const getSheet = (f: Fixture, cookie: string | undefined, q: { termId?: string, classArmId: string, subjectId: string }) =>
  app.request(`/api/scores/sheet?${sheetQuery(q)}`, { host: hostOf(f.school.slug), cookie })
const json = (method: string) => (f: Fixture, cookie: string | undefined, path: string, body: unknown) => app.request(path, {
  host: hostOf(f.school.slug), cookie, method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})
const putJson = json('PUT')
const deleteJson = json('DELETE')
const saveSheet = (f: Fixture, cookie: string | undefined, body: Record<string, unknown>) => putJson(f, cookie, '/api/scores/sheet', body)

/** JSS 1A Mathematics in the current term. */
const mathsSheet = (f: Fixture) => ({ termId: f.first.id, classArmId: f.jss1a.id, subjectId: f.maths.id })
const cell = (student: { id: string }, component: { id: string }, value: number | 'ABS' | null) => ({ studentId: student.id, componentId: component.id, value })
const scoresOf = (f: Fixture, subject: { id: string }) => db.select().from(scoreEntries).where(and(eq(scoreEntries.schoolId, f.school.id), eq(scoreEntries.subjectId, subject.id)))

describe('permissions', () => {
  let f: Fixture
  beforeAll(async () => {
    f = await setup()
  })
  const ROLES: Role[] = ['admin', 'principal', 'mathsTeacher', 'englishTeacher', 'classTeacher', 'bursar', 'parent']
  const sheetRoles = ['admin', 'principal', 'mathsTeacher']

  it.each(ROLES.map(role => [role, ['bursar', 'parent'].includes(role) ? 403 : 200] as const))('GET /api/scores/sheets as %s → %i', async (role, status) => {
    expect((await app.request('/api/scores/sheets', { host: hostOf(f.school.slug), cookie: f.cookies[role] })).status).toBe(status)
  })

  it.each(ROLES.map(role => [role, sheetRoles.includes(role) ? 200 : 403] as const))('GET /api/scores/sheet as %s → %i', async (role, status) => {
    expect((await getSheet(f, f.cookies[role], mathsSheet(f))).status).toBe(status)
  })

  it.each(ROLES.map(role => [role, sheetRoles.includes(role) ? 200 : 403] as const))('PUT /api/scores/sheet as %s → %i', async (role, status) => {
    const res = await saveSheet(f, f.cookies[role], { ...mathsSheet(f), entries: [cell(f.jss[0]!, f.ca1, ROLES.indexOf(role))] })
    expect(res.status).toBe(status)
    const [row] = await db.select().from(scoreEntries).where(and(eq(scoreEntries.studentId, f.jss[0]!.id), eq(scoreEntries.componentId, f.ca1.id)))
    if (status === 403) expect(row?.score).not.toBe(ROLES.indexOf(role))
    else expect(row!.score).toBe(ROLES.indexOf(role))
  })

  it.each(ROLES.map(role => [role, ['admin', 'principal'].includes(role) ? 200 : 403] as const))('PUT and DELETE /api/scores/locks as %s → %i', async (role, status) => {
    const body = { termId: f.second.id, classArmId: f.jss1a.id }
    expect((await putJson(f, f.cookies[role], '/api/scores/locks', body)).status).toBe(status)
    expect((await deleteJson(f, f.cookies[role], '/api/scores/locks', body)).status).toBe(status)
  })

  it('returns 401 without a session', async () => {
    expect((await app.request('/api/scores/sheets', { host: hostOf(f.school.slug) })).status).toBe(401)
    expect((await getSheet(f, undefined, mathsSheet(f))).status).toBe(401)
    expect((await saveSheet(f, undefined, { ...mathsSheet(f), entries: [cell(f.jss[0]!, f.ca1, 1)] })).status).toBe(401)
    expect((await putJson(f, undefined, '/api/scores/locks', { termId: f.first.id, classArmId: f.jss1a.id })).status).toBe(401)
  })
})

describe('GET /api/scores/sheets', () => {
  it('lists a subject teacher\'s own sheets with progress; admin sees every class and subject', async () => {
    const f = await setup()
    const sheets = (cookie: string) => app.request('/api/scores/sheets', { host: hostOf(f.school.slug), cookie }).then(r => r.json())

    const mine = await sheets(f.cookies.mathsTeacher)
    expect(mine.term).toMatchObject({ id: f.first.id, number: 'first' })
    expect(mine.sheets).toEqual([{ classArmId: f.jss1a.id, armLabel: 'JSS 1A', section: 'jss', subjectId: f.maths.id, subjectName: 'Mathematics', students: 3, complete: 0, locked: false }])
    expect((await sheets(f.cookies.classTeacher)).sheets).toEqual([])

    // A complete row (every component, ABS included) counts; a partial one doesn't
    await saveSheet(f, f.cookies.mathsTeacher, { ...mathsSheet(f), entries: [
      cell(f.jss[0]!, f.ca1, 15), cell(f.jss[0]!, f.ca2, 'ABS'), cell(f.jss[0]!, f.exam, 40), cell(f.jss[1]!, f.ca1, 10),
    ] })
    expect((await sheets(f.cookies.mathsTeacher)).sheets[0]).toMatchObject({ students: 3, complete: 1 })

    const all = (await sheets(f.cookies.admin)).sheets as { armLabel: string, subjectName: string, students: number }[]
    expect(all.map(s => `${s.armLabel} ${s.subjectName}`)).toEqual([
      'Nursery 1A Numeracy', 'JSS 1A English Language', 'JSS 1A Mathematics', 'SSS 1A English Language', 'SSS 1A Physics',
    ])
    expect(all.find(s => s.subjectName === 'Physics')!.students).toBe(1)
    expect(all.find(s => s.armLabel === 'SSS 1A' && s.subjectName === 'English Language')!.students).toBe(3)
  })
})

describe('GET /api/scores/sheet', () => {
  let f: Fixture
  beforeAll(async () => {
    f = await setup()
  })

  it('gives the components with their max, the section\'s bands and the students by surname', async () => {
    const body = await (await getSheet(f, f.cookies.mathsTeacher, { classArmId: f.jss1a.id, subjectId: f.maths.id })).json()

    expect(body).toMatchObject({
      term: { id: f.first.id, number: 'first', isCurrent: true },
      arm: { id: f.jss1a.id, label: 'JSS 1A', section: 'jss' },
      subject: { id: f.maths.id, name: 'Mathematics' },
      mode: 'scores',
      locked: false,
      canEdit: true,
      readOnlyReason: null,
      skippedNoDepartment: 0,
    })
    expect(body.components).toEqual([
      { id: f.ca1.id, name: 'CA1', maxScore: 20 },
      { id: f.ca2.id, name: 'CA2', maxScore: 20 },
      { id: f.exam.id, name: 'Exam', maxScore: 60 },
    ])
    expect(body.bands[0]).toEqual({ grade: 'A', minScore: 70, maxScore: 100, remark: 'Excellent' })
    expect(body.students.map((s: { name: string }) => s.name)).toEqual(['Bola Ade', 'Chidi Eze', 'Ada Obi'])
    expect(body.students[0]).toEqual({ id: f.jss[1]!.id, name: 'Bola Ade', admissionNumber: f.jss[1]!.admissionNumber, photoUrl: null, cells: {}, rating: null })
  })

  it('lists only a department subject\'s students and says how many have no department', async () => {
    const physics = await (await getSheet(f, f.cookies.admin, { classArmId: f.sss1a.id, subjectId: f.physics.id })).json()
    expect(physics.students.map((s: { name: string }) => s.name)).toEqual(['Sola Science'])
    expect(physics.skippedNoDepartment).toBe(1)

    const core = await (await getSheet(f, f.cookies.admin, { classArmId: f.sss1a.id, subjectId: f.sssEnglish.id })).json()
    expect(core.students).toHaveLength(3)
    expect(core.skippedNoDepartment).toBe(0)
  })

  it('leaves out removed students', async () => {
    const gone = await createStudent(db, f.school, { deletedAt: new Date() })
    await enrol(db, f.school, { student: gone, session: f.session, arm: f.jss1a })
    const body = await (await getSheet(f, f.cookies.admin, mathsSheet(f))).json()
    expect(body.students.map((s: { id: string }) => s.id)).not.toContain(gone.id)
  })

  it('uses rating mode for Nursery', async () => {
    const body = await (await getSheet(f, f.cookies.admin, { classArmId: f.nursery1a.id, subjectId: f.numeracy.id })).json()
    expect(body).toMatchObject({ mode: 'rating', components: [], bands: [] })
    expect(body.students).toHaveLength(2)
  })

  it('refuses a subject from another section, and unknown ids', async () => {
    expect((await getSheet(f, f.cookies.admin, { classArmId: f.jss1a.id, subjectId: f.physics.id })).status).toBe(400)
    expect((await getSheet(f, f.cookies.admin, { classArmId: f.jss1a.id, subjectId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404)
    expect((await getSheet(f, f.cookies.admin, { classArmId: 'nope', subjectId: f.maths.id })).status).toBe(400)
  })
})

describe('PUT /api/scores/sheet', () => {
  it('saves scores and ABS, updates them, and clears a cell with null', async () => {
    const f = await setup()
    const [ada, bola] = f.jss

    const first = await saveSheet(f, f.cookies.mathsTeacher, { ...mathsSheet(f), entries: [cell(ada!, f.ca1, 15), cell(ada!, f.exam, 'ABS'), cell(bola!, f.ca1, 0)] })
    expect(first.status).toBe(200)
    expect((await first.json()).students.find((s: { name: string }) => s.name === 'Ada Obi').cells).toEqual({
      [f.ca1.id]: { score: 15, absent: false },
      [f.exam.id]: { score: null, absent: true },
    })
    const rows = await scoresOf(f, f.maths)
    expect(rows).toHaveLength(3)
    expect(rows.every(r => r.enteredById === f.users.mathsTeacher.id && r.termId === f.first.id)).toBe(true)
    expect(rows.find(r => r.studentId === bola!.id)!.score).toBe(0)

    await saveSheet(f, f.cookies.mathsTeacher, { ...mathsSheet(f), entries: [cell(ada!, f.ca1, 18), cell(ada!, f.exam, 52), cell(bola!, f.ca1, null)] })
    const after = await scoresOf(f, f.maths)
    expect(after).toHaveLength(2)
    expect(after.find(r => r.componentId === f.exam.id)).toMatchObject({ score: 52, absent: false })
    expect(after.find(r => r.componentId === f.ca1.id)!.score).toBe(18)
  })

  it('refuses the whole save when any cell is invalid, naming every bad cell', async () => {
    const f = await setup()
    const [ada, bola] = f.jss

    const res = await saveSheet(f, f.cookies.mathsTeacher, { ...mathsSheet(f), entries: [
      cell(ada!, f.ca1, 15),
      cell(ada!, f.ca2, 21),
      cell(bola!, f.exam, -1),
      cell(f.sss.scientist, f.ca1, 5),
    ] })

    expect(res.status).toBe(400)
    expect((await res.json()).data.cellErrors).toEqual([
      { studentId: ada!.id, componentId: f.ca2.id, message: 'Enter a score from 0 to 20' },
      { studentId: bola!.id, componentId: f.exam.id, message: 'Enter a score from 0 to 60' },
      { studentId: f.sss.scientist.id, componentId: f.ca1.id, message: 'This student isn\'t on this sheet' },
    ])
    expect(await scoresOf(f, f.maths)).toHaveLength(0)
  })

  it('refuses decimals, a student outside the department, and an unknown component', async () => {
    const f = await setup()
    expect((await saveSheet(f, f.cookies.mathsTeacher, { ...mathsSheet(f), entries: [cell(f.jss[0]!, f.ca1, 7.5)] })).status).toBe(400)

    const physics = { termId: f.first.id, classArmId: f.sss1a.id, subjectId: f.physics.id }
    const res = await saveSheet(f, f.cookies.admin, { ...physics, entries: [cell(f.sss.artist, f.ca1, 10), { studentId: f.sss.scientist.id, componentId: f.first.id, value: 5 }] })
    expect(res.status).toBe(400)
    expect((await res.json()).data.cellErrors.map((e: { message: string }) => e.message)).toEqual(['This student isn\'t on this sheet', 'Unknown assessment'])
  })

  it('saves Nursery ratings, and refuses the wrong kind of value for the section', async () => {
    const f = await setup()
    const nursery = { termId: f.first.id, classArmId: f.nursery1a.id, subjectId: f.numeracy.id }

    const res = await saveSheet(f, f.cookies.admin, { ...nursery, ratings: [{ studentId: f.tots[0]!.id, rating: 'very_good' }] })
    expect(res.status).toBe(200)
    expect((await db.select().from(nurseryRatings).where(eq(nurseryRatings.studentId, f.tots[0]!.id)))[0]!.rating).toBe('very_good')
    await saveSheet(f, f.cookies.admin, { ...nursery, ratings: [{ studentId: f.tots[0]!.id, rating: null }] })
    expect(await db.select().from(nurseryRatings).where(eq(nurseryRatings.studentId, f.tots[0]!.id))).toHaveLength(0)

    expect((await saveSheet(f, f.cookies.admin, { ...nursery, entries: [cell(f.tots[0]!, f.ca1, 5)] })).status).toBe(400)
    expect((await saveSheet(f, f.cookies.admin, { ...mathsSheet(f), ratings: [{ studentId: f.jss[0]!.id, rating: 'good' }] })).status).toBe(400)
  })

  describe('terms', () => {
    it('limits teachers to the current term; admin and principal can edit any term of the current session', async () => {
      const f = await setup()
      const second = { ...mathsSheet(f), termId: f.second.id, entries: [cell(f.jss[0]!, f.ca1, 12)] }

      const teacher = await saveSheet(f, f.cookies.mathsTeacher, second)
      expect(teacher.status).toBe(403)
      expect((await teacher.json()).message).toBe('You can only change scores for the current term')
      expect((await (await getSheet(f, f.cookies.mathsTeacher, second)).json())).toMatchObject({ canEdit: false, readOnlyReason: 'Earlier or later term' })

      expect((await saveSheet(f, f.cookies.admin, second)).status).toBe(200)
      expect((await saveSheet(f, f.cookies.principal, second)).status).toBe(200)
    })

    it('makes earlier sessions read-only for everyone', async () => {
      const f = await setup()
      const old = { ...mathsSheet(f), termId: f.oldTerm.id, entries: [cell(f.jss[0]!, f.ca1, 12)] }
      const res = await saveSheet(f, f.cookies.admin, old)
      expect(res.status).toBe(403)
      expect((await res.json()).message).toBe('Scores from earlier sessions can\'t be changed')
    })
  })

  describe('locking', () => {
    it('makes a locked arm\'s sheets read-only for everyone until unlocked', async () => {
      const f = await setup()
      const lock = { termId: f.first.id, classArmId: f.jss1a.id }
      expect((await putJson(f, f.cookies.principal, '/api/scores/locks', lock)).status).toBe(200)
      expect(await db.select().from(scoreLocks).where(eq(scoreLocks.classArmId, f.jss1a.id))).toHaveLength(1)
      // Locking twice is fine
      expect((await putJson(f, f.cookies.admin, '/api/scores/locks', lock)).status).toBe(200)

      for (const role of ['mathsTeacher', 'admin'] as const) {
        const res = await saveSheet(f, f.cookies[role], { ...mathsSheet(f), entries: [cell(f.jss[0]!, f.ca1, 12)] })
        expect(res.status).toBe(409)
        expect((await res.json()).message).toBe('These scores are locked. Ask the principal or an admin to unlock them.')
      }
      expect(await (await getSheet(f, f.cookies.mathsTeacher, mathsSheet(f))).json()).toMatchObject({ locked: true, canEdit: false, readOnlyReason: 'Locked' })
      expect((await app.request('/api/scores/sheets', { host: hostOf(f.school.slug), cookie: f.cookies.mathsTeacher }).then(r => r.json())).sheets[0].locked).toBe(true)

      expect((await deleteJson(f, f.cookies.admin, '/api/scores/locks', lock)).status).toBe(200)
      expect((await saveSheet(f, f.cookies.mathsTeacher, { ...mathsSheet(f), entries: [cell(f.jss[0]!, f.ca1, 12)] })).status).toBe(200)
    })

    it('needs a term and arm of the school', async () => {
      const f = await setup()
      expect((await putJson(f, f.cookies.admin, '/api/scores/locks', { termId: f.first.id, classArmId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404)
      expect((await putJson(f, f.cookies.admin, '/api/scores/locks', { termId: f.first.id })).status).toBe(400)
    })
  })
})

describe('tenant isolation', () => {
  let a: Fixture
  let b: Fixture
  beforeAll(async () => {
    a = await setup()
    b = await setup()
  })

  it('treats another school\'s arm, subject and term as not found', async () => {
    expect((await getSheet(b, b.cookies.admin, { classArmId: a.jss1a.id, subjectId: b.maths.id })).status).toBe(404)
    expect((await getSheet(b, b.cookies.admin, { classArmId: b.jss1a.id, subjectId: a.maths.id })).status).toBe(404)
    expect((await getSheet(b, b.cookies.admin, { termId: a.first.id, classArmId: b.jss1a.id, subjectId: b.maths.id })).status).toBe(404)
  })

  it('saves nothing for another school\'s ids', async () => {
    expect((await saveSheet(b, b.cookies.admin, { ...mathsSheet(a), entries: [cell(a.jss[0]!, a.ca1, 10)] })).status).toBe(404)
    expect(await scoresOf(a, a.maths)).toHaveLength(0)
    // Another school's students and components in one's own sheet
    const res = await saveSheet(b, b.cookies.admin, { ...mathsSheet(b), entries: [cell(a.jss[0]!, b.ca1, 10), cell(b.jss[0]!, a.ca1, 10)] })
    expect(res.status).toBe(400)
    expect((await res.json()).data.cellErrors.map((e: { message: string }) => e.message)).toEqual(['This student isn\'t on this sheet', 'Unknown assessment'])
    expect((await putJson(b, b.cookies.admin, '/api/scores/locks', { termId: a.first.id, classArmId: a.jss1a.id })).status).toBe(404)
  })

  it('rejects a School A session on School B\'s host', async () => {
    expect((await getSheet(b, a.cookies.admin, mathsSheet(b))).status).toBe(401)
  })

  it('ignores a schoolId in the body', async () => {
    const res = await saveSheet(a, a.cookies.admin, { ...mathsSheet(a), schoolId: b.school.id, entries: [cell(a.jss[0]!, a.ca1, 10)] })
    expect(res.status).toBe(200)
    expect((await scoresOf(a, a.maths))[0]!.schoolId).toBe(a.school.id)
  })
})

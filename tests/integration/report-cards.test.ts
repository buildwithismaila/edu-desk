import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { nurseryRatings, schools, termComments, traitRatings } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createClassArm, createClassLevel, createSubject } from '../factories/academics'
import { createRegister } from '../factories/attendance'
import { createBill, createPayment } from '../factories/fees'
import { createStudent, enrol } from '../factories/students'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'
import { armBody, armQuery, resultsFixture, resultsRequests } from '../helpers/results-fixture'

let db: Db
let app: ReturnType<typeof createTestApp>
let http: ReturnType<typeof resultsRequests>

beforeAll(async () => {
  db = await createTestDb()
  app = createTestApp(db)
  http = resultsRequests(app)
})

describe('report card contents', () => {
  it('has the school, student, subjects, summary, attendance, ratings, comments and next term date', async () => {
    const f = await resultsFixture(db, app)
    const { ada } = f.students
    await createRegister(db, f.school, { term: f.first, arm: f.armA, date: '2026-10-05', marks: [{ student: ada, status: 'present' }] })
    await createRegister(db, f.school, { term: f.first, arm: f.armA, date: '2026-10-06', marks: [{ student: ada, status: 'absent' }] })
    await db.insert(traitRatings).values({ schoolId: f.school.id, termId: f.first.id, studentId: ada.id, trait: 'punctuality', rating: 4 })
    await db.insert(termComments).values({ schoolId: f.school.id, termId: f.first.id, studentId: ada.id, classTeacherComment: 'Hard-working', principalComment: 'Well done' })

    const card = await (await http.get(f, f.cookies.classTeacher, `/api/students/${ada.id}/report-card`)).json()

    expect(card).toMatchObject({
      status: 'draft',
      school: { name: f.school.name, address: '1 School Road, Lagos', motto: 'Knowledge is light', logoUrl: null },
      student: { id: ada.id, name: 'Ada Obi', admissionNumber: ada.admissionNumber, photoUrl: null },
      arm: { label: 'JSS 1A', section: 'jss' },
      term: { id: f.first.id, number: 'first', nextTermBeginsOn: '2027-01-11' },
      mode: 'scores',
      summary: { total: 137, offered: 2, average: 68.5, position: 2, numberInClass: 3, showPositions: true, cumulativeAverage: null },
      attendance: { opened: 2, present: 1, absent: 1, late: 0, rate: 50 },
      comments: { classTeacher: 'Hard-working', principal: 'Well done' },
    })
    expect(card.components.map((c: { name: string }) => c.name)).toEqual(['CA1', 'CA2', 'Exam'])
    expect(card.subjects).toEqual([
      // English: Bola 97, Chidi 90, Ada 60 → Ada 3rd
      { id: f.english.id, name: 'English Language', cells: [10, 10, 40], total: 60, grade: 'B', remark: 'Very Good', position: 3 },
      { id: f.maths.id, name: 'Mathematics', cells: [15, 12, 50], total: 77, grade: 'A', remark: 'Excellent', position: 2 },
    ])
    expect(card.traits.affective[0]).toEqual({ label: 'Punctuality', rating: 4 })
    expect(card.traits.psychomotor[0]).toEqual({ label: 'Handwriting', rating: null })

    const bola = await (await http.get(f, f.cookies.admin, `/api/students/${f.students.bola.id}/report-card`)).json()
    expect(bola.subjects.find((s: { name: string }) => s.name === 'Mathematics').cells).toEqual([10, 'ABS', 30])
  })

  it('hides positions when the school turns them off', async () => {
    const f = await resultsFixture(db, app)
    await db.update(schools).set({ showPositions: false }).where(eq(schools.id, f.school.id))
    const card = await (await http.get(f, f.cookies.admin, `/api/students/${f.students.ada.id}/report-card`)).json()
    expect(card.summary).toMatchObject({ position: null, showPositions: false })
    expect(card.subjects.every((s: { position: number | null }) => s.position === null)).toBe(true)
  })

  it('gives Nursery students skill ratings instead of scores', async () => {
    const f = await resultsFixture(db, app)
    const nursery = await createClassArm(db, f.school, await createClassLevel(db, f.school, { section: 'nursery', name: 'Nursery 1' }), 'A')
    const numeracy = await createSubject(db, f.school, { section: 'nursery', name: 'Numeracy' })
    const tot = await createStudent(db, f.school, { firstName: 'Tobi', lastName: 'Ade' })
    await enrol(db, f.school, { student: tot, session: f.session, arm: nursery })
    await db.insert(nurseryRatings).values({ schoolId: f.school.id, termId: f.first.id, studentId: tot.id, subjectId: numeracy.id, rating: 'very_good' })

    const card = await (await http.get(f, f.cookies.admin, `/api/students/${tot.id}/report-card`)).json()
    expect(card).toMatchObject({ mode: 'rating', subjects: [], nurseryRatings: [{ subject: 'Numeracy', rating: 'Very Good' }], summary: { total: null, position: null } })
  })

  it('lists every student\'s card for the arm', async () => {
    const f = await resultsFixture(db, app)
    const cards = await (await http.get(f, f.cookies.classTeacher, `/api/results/report-cards?${armQuery(f)}`)).json()
    expect(cards.map((c: { student: { name: string } }) => c.student.name)).toEqual(['Bola Ade', 'Chidi Eze', 'Ada Obi'])
  })
})

describe('outstanding fees on the card', () => {
  it('shows the term balance only when the school turns it on', async () => {
    const f = await resultsFixture(db, app)
    const bill = await createBill(db, f.school, { term: f.first, student: f.students.ada, level: f.level, arm: f.armA, items: [{ name: 'Tuition', amountKobo: 5_000_000 }] })
    await createPayment(db, f.school, { bill, student: f.students.ada, amountKobo: 1_000_000 })
    const card = async (student = f.students.ada) => (await (await http.get(f, f.cookies.admin, `/api/students/${student.id}/report-card`)).json()).fees

    expect(await card()).toBeNull()
    await db.update(schools).set({ showFeesOnReportCard: true }).where(eq(schools.id, f.school.id))
    expect(await card()).toEqual({ balanceKobo: 4_000_000 })
    // No bill this term
    expect(await card(f.students.bola)).toEqual({ balanceKobo: null })
  })
})

describe('who can open a report card', () => {
  it('shows parents their own child\'s card only once published', async () => {
    const f = await resultsFixture(db, app)
    const parentCard = (cookie: string, student = f.students.ada) => http.get(f, cookie, `/api/students/${student.id}/report-card`)

    expect((await parentCard(f.cookies.parent)).status).toBe(404)
    await http.post(f, f.cookies.classTeacher, '/api/results/submit', armBody(f))
    expect((await parentCard(f.cookies.parent)).status).toBe(404)
    await http.post(f, f.cookies.principal, '/api/results/publish', armBody(f))

    const res = await parentCard(f.cookies.parent)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'published', student: { name: 'Ada Obi' }, summary: { average: 68.5 } })
    // "My children" links to it now
    const children = await (await http.get(f, f.cookies.parent, '/api/me/children')).json()
    expect(children[0].latestReportCard).toEqual({ termId: f.first.id, term: `First Term ${f.session.name}`, withheld: false, owedKobo: null })
    // Another family's child
    expect((await parentCard(f.cookies.dayoParent)).status).toBe(404)
    expect((await parentCard(f.cookies.parent, f.students.bola)).status).toBe(404)
  })

  it('keeps it from staff who can\'t see the arm\'s results', async () => {
    const f = await resultsFixture(db, app)
    // The Maths teacher can see Ada, but isn't her class teacher
    expect((await http.get(f, f.cookies.subjectTeacher, `/api/students/${f.students.ada.id}/report-card`)).status).toBe(403)
    expect((await http.get(f, f.cookies.bursar, `/api/students/${f.students.ada.id}/report-card`)).status).toBe(403)
  })
})

describe('broadsheet', () => {
  it('has subject totals, overall results and class stats per subject', async () => {
    const f = await resultsFixture(db, app)
    const body = await (await http.get(f, f.cookies.classTeacher, `/api/results/broadsheet?${armQuery(f)}`)).json()

    expect(body.subjects).toEqual([{ id: f.english.id, name: 'English Language' }, { id: f.maths.id, name: 'Mathematics' }])
    expect(body.students.map((s: { name: string, totals: Record<string, number>, total: number, average: number, position: number }) =>
      [s.name, s.totals[f.english.id], s.totals[f.maths.id], s.total, s.average, s.position])).toEqual([
      ['Chidi Eze', 90, 90, 180, 90, 1],
      ['Ada Obi', 60, 77, 137, 68.5, 2],
      ['Bola Ade', 97, 40, 137, 68.5, 2],
    ])
    expect(body.subjectStats).toEqual([
      { subjectId: f.english.id, students: 3, average: 82.33, highest: 97, lowest: 60 },
      { subjectId: f.maths.id, students: 3, average: 69, highest: 90, lowest: 40 },
    ])
  })
})

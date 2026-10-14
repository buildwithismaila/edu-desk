import { and, eq, inArray, isNull } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { students } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { SCHOOL_TIME_ZONE, todayIn } from '~~/shared/utils/dates'
import { createSubject } from '../factories/academics'
import { createRegister } from '../factories/attendance'
import { createBill, createPayment } from '../factories/fees'
import { createSchool } from '../factories/schools'
import { createAssessmentComponents, createScore } from '../factories/scores'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'
import { feesFixture, type FeesFixture, feesRequests, hostOf } from '../helpers/fees-fixture'

let db: Db
let app: ReturnType<typeof createTestApp>
let http: ReturnType<typeof feesRequests>

beforeAll(async () => {
  db = await createTestDb()
  app = createTestApp(db)
  http = feesRequests(app)
})

const today = () => todayIn(SCHOOL_TIME_ZONE)

/**
 * The fees fixture plus today's activity: JSS 1A's register today (Ada present, Bola absent) and an older one;
 * JSS 1 Mathematics with Ada and Bola fully scored in JSS 1A (that sheet complete; JSS 1B's not);
 * bills for Ada (₦87,500, ₦30,000 paid today, ₦10,000 reversed), Chidi (₦87,500, ₦87,500 paid earlier) and
 * Dayo (₦95,000, nothing paid).
 */
async function dashboardFixture() {
  const f = await feesFixture(db, app)
  const { ada, bola, chidi, dayo } = f.students
  await createRegister(db, f.school, { term: f.term, arm: f.jss1a, date: today(), marks: [{ student: ada, status: 'present' }, { student: bola, status: 'absent' }] })
  await createRegister(db, f.school, { term: f.term, arm: f.jss1b, date: '2026-09-15', marks: [{ student: chidi, status: 'absent' }] })

  const components = await createAssessmentComponents(db, f.school)
  const maths = await createSubject(db, f.school, { section: 'jss', name: 'Mathematics' })
  for (const student of [ada, bola]) {
    for (const component of components) await createScore(db, f.school, { term: f.term, student, subject: maths, component, score: 5 })
  }

  const jssItems = [{ name: 'Tuition', amountKobo: 8_500_000 }, { name: 'PTA', amountKobo: 250_000 }]
  const adaBill = await createBill(db, f.school, { term: f.term, student: ada, level: f.jss1, arm: f.jss1a, items: jssItems })
  await createPayment(db, f.school, { bill: adaBill, student: ada, amountKobo: 3_000_000, paidOn: today() })
  await createPayment(db, f.school, { bill: adaBill, student: ada, amountKobo: 1_000_000, paidOn: today(), reversed: true })
  const chidiBill = await createBill(db, f.school, { term: f.term, student: chidi, level: f.jss1, arm: f.jss1b, items: jssItems })
  await createPayment(db, f.school, { bill: chidiBill, student: chidi, amountKobo: 8_750_000, paidOn: '2026-09-20' })
  await createBill(db, f.school, { term: f.term, student: dayo, level: f.sss1, arm: f.sss1a, items: [{ name: 'Tuition', amountKobo: 9_500_000 }] })
  return f
}

const dashboard = async (f: FeesFixture, cookie: string) => (await http.get(f, cookie, '/api/dashboard')).json()

describe('GET /api/dashboard: the numbers', () => {
  let f: FeesFixture
  beforeAll(async () => {
    f = await dashboardFixture()
    // Another school's activity must never be counted
    await dashboardFixture()
  })

  it('counts this session\'s active students by section and gender', async () => {
    const body = await dashboard(f, f.cookies.admin)
    const enrolled = await db.select({ gender: students.gender }).from(students)
      .where(and(eq(students.schoolId, f.school.id), isNull(students.deletedAt), inArray(students.id, [f.students.ada.id, f.students.bola.id, f.students.chidi.id, f.students.dayo.id])))

    expect(body.term).toEqual({ id: f.term.id, label: `First Term ${f.session.name}` })
    // The removed student isn't counted
    expect(body.students.total).toBe(4)
    expect(body.students.bySection).toEqual([{ section: 'jss', count: 3 }, { section: 'sss', count: 1 }])
    expect(body.students.female).toBe(enrolled.filter(s => s.gender === 'female').length)
    expect(body.students.male).toBe(enrolled.filter(s => s.gender === 'male').length)
  })

  it('has today\'s attendance: registers taken, the rate and the classes not taken', async () => {
    const body = await dashboard(f, f.cookies.admin)
    expect(body.attendance).toEqual({
      date: today(),
      taken: 1,
      total: 3,
      marked: 2,
      present: 1,
      absent: 1,
      late: 0,
      rate: 50,
      notTaken: [{ id: f.jss1b.id, label: 'JSS 1B' }, { id: f.sss1a.id, label: 'SSS 1A' }],
    })
  })

  it('has the term\'s fees, matching Collections and Debtors', async () => {
    const body = await dashboard(f, f.cookies.admin)
    const collections = await (await http.get(f, f.cookies.admin, `/api/fees/collections?termId=${f.term.id}`)).json()
    const debtors = await (await http.get(f, f.cookies.admin, `/api/fees/debtors?termId=${f.term.id}`)).json()

    expect(body.fees).toEqual({
      expectedKobo: collections.expectedKobo,
      collectedKobo: collections.collectedKobo,
      outstandingKobo: collections.outstandingKobo,
      percentCollected: Math.round(collections.collectedKobo / collections.expectedKobo * 100),
      todayKobo: 3_000_000,
      debtors: debtors.count,
    })
    // By hand: 87,500 + 87,500 + 95,000 expected; 30,000 + 87,500 collected; Ada 57,500 + Dayo 95,000 owed
    expect(body.fees).toMatchObject({ expectedKobo: 27_000_000, collectedKobo: 11_750_000, outstandingKobo: 15_250_000, percentCollected: 44, debtors: 2 })
  })

  it('has result-entry progress matching the Scores and Results pages', async () => {
    const body = await dashboard(f, f.cookies.admin)
    const { sheets } = await (await http.get(f, f.cookies.admin, '/api/scores/sheets')).json()
    const withStudents = sheets.filter((s: { students: number }) => s.students > 0)

    expect(body.results.sheets).toEqual({
      complete: withStudents.filter((s: { students: number, complete: number }) => s.complete === s.students).length,
      total: withStudents.length,
    })
    // JSS 1A and JSS 1B Mathematics; only JSS 1A's is complete
    expect(body.results.sheets).toEqual({ complete: 1, total: 2 })
    // Arms with students this session, by status
    expect(body.results.arms).toEqual({ draft: 3, submitted: 0, published: 0 })
  })
})

describe('GET /api/dashboard: who sees what', () => {
  let f: FeesFixture
  beforeAll(async () => {
    f = await dashboardFixture()
  })

  it.each(['admin', 'principal'] as const)('gives %s every block', async (role) => {
    const body = await dashboard(f, f.cookies[role])
    for (const block of ['students', 'attendance', 'fees', 'results']) expect(body[block], block).not.toBeNull()
  })

  it('gives the bursar students and fees, nothing academic', async () => {
    const body = await dashboard(f, f.cookies.bursar)
    expect(body.students.total).toBe(4)
    expect(body.fees.debtors).toBe(2)
    expect(body.attendance).toBeNull()
    expect(body.results).toBeNull()
  })

  it.each(['teacher', 'parent'] as const)('refuses %s (403)', async (role) => {
    expect((await http.get(f, f.cookies[role], '/api/dashboard')).status).toBe(403)
  })

  it('asks for a login without a session (401)', async () => {
    expect((await http.get(f, undefined, '/api/dashboard')).status).toBe(401)
  })
})

describe('GET /api/dashboard: a school without a current term', () => {
  it('has empty blocks instead of failing', async () => {
    const school = await createSchool(db)
    const admin = await createUser(db, school, { role: 'admin' })
    const cookie = await app.login(hostOf(school.slug), admin.email!, DEFAULT_TEST_PASSWORD)
    const res = await app.request('/api/dashboard', { host: hostOf(school.slug), cookie })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ term: null, students: null, attendance: null, fees: null, results: null })
  })
})

import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { discounts, schools, studentGuardians } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createRegister } from '../factories/attendance'
import { createBill, createPayment } from '../factories/fees'
import { createGuardian, createStudent, enrol } from '../factories/students'
import { DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'
import { armBody, hostOf, resultsFixture, resultsRequests, type ResultsFixture } from '../helpers/results-fixture'

let db: Db
let app: ReturnType<typeof createTestApp>
let http: ReturnType<typeof resultsRequests>

beforeAll(async () => {
  db = await createTestDb()
  app = createTestApp(db)
  http = resultsRequests(app)
})

/**
 * The results fixture plus a family around Ada:
 *   Ada's parent also has Ebuka (JSS 1B) and a removed child; Ada has a second guardian.
 *   Ada's first-term bill: Tuition ₦50,000, a ₦5,000 discount, ₦20,000 paid and ₦10,000 paid then reversed
 *   → balance ₦25,000. Dayo (another family) has a bill with a payment.
 *   Ada's attendance: first term present, absent, late (rate 67); second term one absence.
 */
async function portalFixture() {
  const f = await resultsFixture(db, app)
  const { ada, dayo } = f.students
  const ebuka = await createStudent(db, f.school, { firstName: 'Ebuka', lastName: 'Obi', guardians: [f.parents.ada] })
  await enrol(db, f.school, { student: ebuka, session: f.session, arm: f.armB })
  const removed = await createStudent(db, f.school, { firstName: 'Gone', lastName: 'Obi', guardians: [f.parents.ada], deletedAt: new Date() })
  const coGuardian = await createGuardian(db, f.school)
  await db.insert(studentGuardians).values({ schoolId: f.school.id, studentId: ada.id, guardianId: coGuardian.id, relationship: 'father' })

  const adaBill = await createBill(db, f.school, { term: f.first, student: ada, level: f.level, arm: f.armA, items: [{ name: 'Tuition', amountKobo: 5_000_000 }] })
  await db.insert(discounts).values({ schoolId: f.school.id, billId: adaBill.id, kind: 'fixed', value: 500_000, reason: 'Sibling' })
  const adaPaid = await createPayment(db, f.school, { bill: adaBill, student: ada, amountKobo: 2_000_000, paidOn: '2026-10-05' })
  const adaReversed = await createPayment(db, f.school, { bill: adaBill, student: ada, amountKobo: 1_000_000, paidOn: '2026-10-06', reversed: true })
  const dayoBill = await createBill(db, f.school, { term: f.first, student: dayo, level: f.level, arm: f.armB, items: [{ name: 'Tuition', amountKobo: 5_000_000 }] })
  const dayoPaid = await createPayment(db, f.school, { bill: dayoBill, student: dayo, amountKobo: 1_000_000 })

  await createRegister(db, f.school, { term: f.first, arm: f.armA, date: '2026-10-05', marks: [{ student: ada, status: 'present' }] })
  await createRegister(db, f.school, { term: f.first, arm: f.armA, date: '2026-10-06', marks: [{ student: ada, status: 'absent' }] })
  await createRegister(db, f.school, { term: f.first, arm: f.armA, date: '2026-10-07', marks: [{ student: ada, status: 'late' }] })
  await createRegister(db, f.school, { term: f.second, arm: f.armA, date: '2027-01-12', marks: [{ student: ada, status: 'absent' }] })

  const cookies = {
    ...f.cookies,
    coGuardian: await app.login(hostOf(f.school.slug), coGuardian.email!, DEFAULT_TEST_PASSWORD),
  }
  return { ...f, cookies, ebuka, removed, adaBill, adaPaid, adaReversed, dayoPaid }
}
type PortalFixture = Awaited<ReturnType<typeof portalFixture>>

const publish = async (f: ResultsFixture) => {
  expect((await http.post(f, f.cookies.classTeacher, '/api/results/submit', armBody(f))).status).toBe(200)
  expect((await http.post(f, f.cookies.principal, '/api/results/publish', armBody(f))).status).toBe(200)
}

/** Every parent route for a child (the receipt one with a payment id). */
const childPaths = (childId: string, paymentId: string) => [
  `/api/me/children/${childId}`,
  `/api/me/children/${childId}/results`,
  `/api/me/children/${childId}/attendance`,
  `/api/me/children/${childId}/fees`,
  `/api/me/children/${childId}/payments/${paymentId}`,
]

describe('who can use the parent routes', () => {
  let f: PortalFixture
  let other: PortalFixture
  beforeAll(async () => {
    f = await portalFixture()
    other = await portalFixture()
  })

  it('lets a parent open each route for their own child', async () => {
    for (const path of childPaths(f.students.ada.id, f.adaPaid.id)) {
      expect([path, (await http.get(f, f.cookies.parent, path)).status]).toEqual([path, 200])
    }
  })

  it('lets a second guardian open them too', async () => {
    for (const path of childPaths(f.students.ada.id, f.adaPaid.id)) {
      expect([path, (await http.get(f, f.cookies.coGuardian, path)).status]).toEqual([path, 200])
    }
  })

  it('hides another family\'s child (404)', async () => {
    for (const path of childPaths(f.students.dayo.id, f.dayoPaid.id)) {
      expect([path, (await http.get(f, f.cookies.parent, path)).status]).toEqual([path, 404])
    }
    // Not even with the parent's own payment id under another family's child
    for (const path of childPaths(f.students.ada.id, f.adaPaid.id)) {
      expect([path, (await http.get(f, f.cookies.dayoParent, path)).status]).toEqual([path, 404])
    }
  })

  it('hides a removed child (404)', async () => {
    for (const path of childPaths(f.removed.id, f.adaPaid.id)) {
      expect([path, (await http.get(f, f.cookies.parent, path)).status]).toEqual([path, 404])
    }
  })

  it('hides another school\'s child and payment on this school\'s host (404)', async () => {
    for (const path of childPaths(other.students.ada.id, other.adaPaid.id)) {
      expect([path, (await http.get(f, f.cookies.parent, path)).status]).toEqual([path, 404])
    }
    // Their own child, with another school's payment id
    expect((await http.get(f, f.cookies.parent, `/api/me/children/${f.students.ada.id}/payments/${other.adaPaid.id}`)).status).toBe(404)
  })

  it('hides a payment on another child\'s bill, even a sibling\'s path (404)', async () => {
    // Dayo's payment under Ada's path
    expect((await http.get(f, f.cookies.parent, `/api/me/children/${f.students.ada.id}/payments/${f.dayoPaid.id}`)).status).toBe(404)
    // Ada's payment under her brother's path
    expect((await http.get(f, f.cookies.parent, `/api/me/children/${f.ebuka.id}/payments/${f.adaPaid.id}`)).status).toBe(404)
  })

  it('asks for a login without a session (401)', async () => {
    for (const path of childPaths(f.students.ada.id, f.adaPaid.id)) {
      expect([path, (await http.get(f, undefined, path)).status]).toEqual([path, 401])
    }
  })

  it.each(['admin', 'principal', 'classTeacher', 'bursar'] as const)('refuses %s (403)', async (role) => {
    for (const path of childPaths(f.students.ada.id, f.adaPaid.id)) {
      expect([path, (await http.get(f, f.cookies[role], path)).status]).toEqual([path, 403])
    }
  })

  it('rejects bad ids and terms', async () => {
    expect((await http.get(f, f.cookies.parent, '/api/me/children/not-a-uuid')).status).toBe(400)
    expect((await http.get(f, f.cookies.parent, `/api/me/children/${f.students.ada.id}/payments/nope`)).status).toBe(400)
    expect((await http.get(f, f.cookies.parent, `/api/me/children/${f.students.ada.id}/attendance?termId=nope`)).status).toBe(400)
    // Another school's term
    expect((await http.get(f, f.cookies.parent, `/api/me/children/${f.students.ada.id}/attendance?termId=${other.first.id}`)).status).toBe(404)
    expect((await http.get(f, f.cookies.parent, `/api/me/children/${f.students.ada.id}/fees?termId=${other.first.id}`)).status).toBe(404)
  })
})

describe('child overview', () => {
  it('has the child, their class and the terms for the pickers', async () => {
    const f = await portalFixture()
    const body = await (await http.get(f, f.cookies.parent, `/api/me/children/${f.students.ada.id}`)).json()

    const label = (n: string) => `${n} Term ${f.session.name}`
    expect(body).toEqual({
      id: f.students.ada.id,
      name: 'Ada Obi',
      admissionNumber: f.students.ada.admissionNumber,
      classLabel: 'JSS 1A',
      photoUrl: null,
      currentTermId: f.first.id,
      // Newest first: every term of the sessions she's enrolled in
      attendanceTerms: [
        { id: f.third.id, label: label('Third') },
        { id: f.second.id, label: label('Second') },
        { id: f.first.id, label: label('First') },
      ],
      feeTerms: [{ id: f.first.id, label: label('First') }],
    })
  })
})

describe('results', () => {
  it('lists only published report cards and follows publish / unpublish', async () => {
    const f = await portalFixture()
    const results = async () => (await http.get(f, f.cookies.parent, `/api/me/children/${f.students.ada.id}/results`)).json()

    expect(await results()).toEqual([])
    await http.post(f, f.cookies.classTeacher, '/api/results/submit', armBody(f))
    expect(await results()).toEqual([])

    await http.post(f, f.cookies.principal, '/api/results/publish', armBody(f))
    expect(await results()).toEqual([{
      termId: f.first.id,
      term: `First Term ${f.session.name}`,
      publishedAt: expect.any(String),
      average: 68.5,
      position: 2,
      numberInClass: 3,
    }])

    expect((await http.post(f, f.cookies.principal, '/api/results/unpublish', armBody(f))).status).toBe(200)
    expect(await results()).toEqual([])
  })

  it('leaves out the position when the school hid positions', async () => {
    const f = await portalFixture()
    await db.update(schools).set({ showPositions: false }).where(eq(schools.id, f.school.id))
    await publish(f)

    const [card] = await (await http.get(f, f.cookies.parent, `/api/me/children/${f.students.ada.id}/results`)).json()
    expect(card).toMatchObject({ average: 68.5, position: null, numberInClass: null })
  })
})

describe('attendance', () => {
  it('has the current term\'s summary and the days absent or late', async () => {
    const f = await portalFixture()
    const body = await (await http.get(f, f.cookies.parent, `/api/me/children/${f.students.ada.id}/attendance`)).json()

    expect(body).toEqual({
      term: { id: f.first.id, label: `First Term ${f.session.name}` },
      opened: 3,
      present: 2,
      absent: 1,
      late: 1,
      rate: 67,
      absentDates: ['2026-10-06'],
      lateDates: ['2026-10-07'],
    })
  })

  it('shows any term', async () => {
    const f = await portalFixture()
    const body = await (await http.get(f, f.cookies.parent, `/api/me/children/${f.students.ada.id}/attendance?termId=${f.second.id}`)).json()
    expect(body).toMatchObject({ term: { id: f.second.id }, opened: 1, absent: 1, rate: 0, absentDates: ['2027-01-12'] })

    const empty = await (await http.get(f, f.cookies.parent, `/api/me/children/${f.students.ada.id}/attendance?termId=${f.third.id}`)).json()
    expect(empty).toMatchObject({ opened: 0, rate: null, absentDates: [], lateDates: [] })
  })
})

describe('fees', () => {
  it('has the term\'s bill with reversed payments flagged, without staff-only details', async () => {
    const f = await portalFixture()
    const body = await (await http.get(f, f.cookies.parent, `/api/me/children/${f.students.ada.id}/fees`)).json()

    expect(body.term).toEqual({ id: f.first.id, label: `First Term ${f.session.name}` })
    expect(body.bill.lines).toEqual([{ kind: 'item', description: 'Tuition', amountKobo: 5_000_000 }])
    expect(body.bill.discounts).toEqual([{ reason: 'Sibling', amountKobo: 500_000 }])
    expect(body.bill.payments).toEqual([
      { id: f.adaPaid.id, receiptNumber: f.adaPaid.receiptNumber, amountKobo: 2_000_000, method: 'cash', paidOn: '2026-10-05', reversed: false },
      { id: f.adaReversed.id, receiptNumber: f.adaReversed.receiptNumber, amountKobo: 1_000_000, method: 'cash', paidOn: '2026-10-06', reversed: true },
    ])
    // ₦50,000 − ₦5,000 − ₦20,000 (the reversed ₦10,000 doesn't count)
    expect(body.bill.totals).toMatchObject({ balance: 2_500_000, paid: 2_000_000 })
    const text = JSON.stringify(body)
    expect(text).not.toContain('Test reversal')
    expect(body.ledger).toBeUndefined()
    expect(body.bill.optionalItems).toBeUndefined()
  })

  it('has no bill for a term without one', async () => {
    const f = await portalFixture()
    const body = await (await http.get(f, f.cookies.parent, `/api/me/children/${f.students.ada.id}/fees?termId=${f.second.id}`)).json()
    expect(body).toEqual({ term: { id: f.second.id, label: `Second Term ${f.session.name}` }, bill: null })
  })
})

describe('receipts', () => {
  it('has the receipt for the child\'s payment, without the reversal reason', async () => {
    const f = await portalFixture()
    const paid = await (await http.get(f, f.cookies.parent, `/api/me/children/${f.students.ada.id}/payments/${f.adaPaid.id}`)).json()
    expect(paid).toMatchObject({
      id: f.adaPaid.id,
      receiptNumber: f.adaPaid.receiptNumber,
      amountKobo: 2_000_000,
      student: { id: f.students.ada.id, name: 'Ada Obi' },
      classLabel: 'JSS 1A',
      balanceKobo: 2_500_000,
      reversal: null,
      school: { name: f.school.name },
    })

    const reversed = await (await http.get(f, f.cookies.parent, `/api/me/children/${f.students.ada.id}/payments/${f.adaReversed.id}`)).json()
    expect(reversed.reversal).toEqual({ at: expect.any(String) })
    expect(JSON.stringify(reversed)).not.toContain('Test reversal')
  })
})

describe('GET /api/me/children (dashboard cards)', () => {
  it('adds this term\'s attendance, fee balance and the latest published report card', async () => {
    const f = await portalFixture()
    const before = await (await http.get(f, f.cookies.parent, '/api/me/children')).json()
    // Siblings, removed child left out
    expect(before.map((c: { name: string }) => c.name)).toEqual(['Ada Obi', 'Ebuka Obi'])
    expect(before[0]).toMatchObject({ classLabel: 'JSS 1A', attendanceRate: 67, absentDays: 1, balanceKobo: 2_500_000, latestReportCard: null })
    // No registers or bill for Ebuka
    expect(before[1]).toMatchObject({ classLabel: 'JSS 1B', attendanceRate: null, absentDays: 0, balanceKobo: null, latestReportCard: null })

    await publish(f)
    const [ada] = await (await http.get(f, f.cookies.parent, '/api/me/children')).json()
    expect(ada.latestReportCard).toEqual({ termId: f.first.id, term: `First Term ${f.session.name}` })

    // The second guardian sees Ada too
    const theirs = await (await http.get(f, f.cookies.coGuardian, '/api/me/children')).json()
    expect(theirs.map((c: { name: string }) => c.name)).toEqual(['Ada Obi'])
  })
})

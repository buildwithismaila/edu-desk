import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { discounts, schools, studentGuardians } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createBill, createPayment } from '../factories/fees'
import { createGuardian } from '../factories/students'
import { DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'
import { feesFixture, feesRequests, hostOf } from '../helpers/fees-fixture'

let db: Db
let app: ReturnType<typeof createTestApp>
let http: ReturnType<typeof feesRequests>

beforeAll(async () => {
  db = await createTestDb()
  app = createTestApp(db)
  http = feesRequests(app)
})

const ACCOUNTS = [
  { bankName: 'Zenith Bank', accountName: 'Test School Fees Account', accountNumber: '1012345678' },
  { bankName: 'GTBank', accountName: 'Test School', accountNumber: '0123456789' },
]

/**
 * The fees fixture with two bank accounts and bills: Ada (JSS 1A) ₦87,500 + ₦32,500 arrears − ₦5,000 discount,
 * ₦30,000 paid and ₦10,000 reversed → ₦85,000 due; Bola (JSS 1A) ₦87,500, nothing paid; Chidi (JSS 1B).
 */
async function invoiceFixture() {
  const f = await feesFixture(db, app)
  await db.update(schools).set({ bankAccounts: ACCOUNTS, address: '1 School Road, Lagos' }).where(eq(schools.id, f.school.id))
  const items = [{ name: 'Tuition', amountKobo: 8_500_000 }, { name: 'PTA', amountKobo: 250_000 }]
  const adaBill = await createBill(db, f.school, { term: f.term, student: f.students.ada, level: f.jss1, arm: f.jss1a, items, carryForwardKobo: 3_250_000 })
  await db.insert(discounts).values({ schoolId: f.school.id, billId: adaBill.id, kind: 'fixed', value: 500_000, reason: 'Sibling discount' })
  await createPayment(db, f.school, { bill: adaBill, student: f.students.ada, amountKobo: 3_000_000 })
  await createPayment(db, f.school, { bill: adaBill, student: f.students.ada, amountKobo: 1_000_000, reversed: true })
  const bolaBill = await createBill(db, f.school, { term: f.term, student: f.students.bola, level: f.jss1, arm: f.jss1a, items })
  const chidiBill = await createBill(db, f.school, { term: f.term, student: f.students.chidi, level: f.jss1, arm: f.jss1b, items })
  return { ...f, adaBill, bolaBill, chidiBill }
}
type Fixture = Awaited<ReturnType<typeof invoiceFixture>>

describe('school bank accounts', () => {
  it('saves up to two accounts on the profile, validated', async () => {
    const f = await feesFixture(db, app)
    const save = (bankAccounts: unknown) => http.patch(f, f.cookies.admin, '/api/school/profile', { bankAccounts })

    const res = await save(ACCOUNTS)
    expect(res.status).toBe(200)
    expect((await res.json()).bankAccounts).toEqual(ACCOUNTS)
    expect((await (await http.get(f, f.cookies.bursar, '/api/school/profile')).json()).bankAccounts).toEqual(ACCOUNTS)

    expect((await save([...ACCOUNTS, ACCOUNTS[0]])).status).toBe(400)
    for (const accountNumber of ['12345', '12345678901', '10123456AB']) {
      const bad = await save([{ ...ACCOUNTS[0], accountNumber }])
      expect(bad.status).toBe(400)
    }
    expect((await save([{ ...ACCOUNTS[0], bankName: '' }])).status).toBe(400)
    expect((await save([])).status).toBe(200)
    expect((await http.patch(f, f.cookies.bursar, '/api/school/profile', { bankAccounts: ACCOUNTS })).status).toBe(403)
  })
})

describe('GET /api/fees/bills/[id]/invoice', () => {
  let f: Fixture
  beforeAll(async () => {
    f = await invoiceFixture()
  })

  it('has the school with its bank accounts, the student, the bill and the balance due', async () => {
    const body = await (await http.get(f, f.cookies.bursar, `/api/fees/bills/${f.adaBill.id}/invoice`)).json()

    expect(body).toMatchObject({
      school: { name: f.school.name, address: '1 School Road, Lagos', logoUrl: null, bankAccounts: ACCOUNTS },
      student: { name: 'Ada Obi', admissionNumber: f.students.ada.admissionNumber },
      classLabel: 'JSS 1A',
      term: `First Term ${f.session.name}`,
      issuedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    })
    expect(body.lines).toEqual([
      { kind: 'item', description: 'Tuition', amountKobo: 8_500_000 },
      { kind: 'item', description: 'PTA', amountKobo: 250_000 },
      { kind: 'carry_forward', description: 'Arrears brought forward', amountKobo: 3_250_000 },
    ])
    expect(body.discounts).toEqual([{ reason: 'Sibling discount', amountKobo: 500_000 }])
    // 87,500 + 32,500 − 5,000 − 30,000 (the reversed 10,000 doesn't count)
    expect(body.totals).toMatchObject({ billed: 12_000_000, discountTotal: 500_000, paid: 3_000_000, balance: 8_500_000 })
  })

  it.each(['admin', 'principal'] as const)('lets %s print it', async (role) => {
    expect((await http.get(f, f.cookies[role], `/api/fees/bills/${f.adaBill.id}/invoice`)).status).toBe(200)
  })

  it.each(['teacher', 'parent'] as const)('refuses %s (403)', async (role) => {
    expect((await http.get(f, f.cookies[role], `/api/fees/bills/${f.adaBill.id}/invoice`)).status).toBe(403)
  })

  it('treats another school\'s bill as not found, and checks the id', async () => {
    const other = await invoiceFixture()
    expect((await http.get(f, f.cookies.bursar, `/api/fees/bills/${other.adaBill.id}/invoice`)).status).toBe(404)
    expect((await http.get(f, f.cookies.bursar, '/api/fees/bills/nope/invoice')).status).toBe(400)
  })
})

describe('GET /api/fees/invoices (a whole class)', () => {
  it('has one invoice per billed student in the class, by name', async () => {
    const f = await invoiceFixture()
    const body = await (await http.get(f, f.cookies.bursar, `/api/fees/invoices?termId=${f.term.id}&classArmId=${f.jss1a.id}`)).json()
    expect(body.arm).toEqual({ id: f.jss1a.id, label: 'JSS 1A' })
    expect(body.invoices.map((i: { student: { name: string }, totals: { balance: number } }) => [i.student.name, i.totals.balance])).toEqual([
      ['Bola Ade', 8_750_000],
      ['Ada Obi', 8_500_000],
    ])
  })

  it('needs the class, keeps teachers out and other schools\' classes not found', async () => {
    const f = await invoiceFixture()
    const other = await invoiceFixture()
    expect((await http.get(f, f.cookies.bursar, '/api/fees/invoices')).status).toBe(400)
    expect((await http.get(f, f.cookies.teacher, `/api/fees/invoices?classArmId=${f.jss1a.id}`)).status).toBe(403)
    expect((await http.get(f, f.cookies.bursar, `/api/fees/invoices?classArmId=${other.jss1a.id}`)).status).toBe(404)
  })
})

describe('GET /api/me/children/[id]/invoice (parents)', () => {
  it('gives a parent their own child\'s invoice only', async () => {
    const f = await invoiceFixture()
    const own = await http.get(f, f.cookies.parent, `/api/me/children/${f.students.ada.id}/invoice`)
    expect(own.status).toBe(200)
    expect(await own.json()).toMatchObject({ student: { name: 'Ada Obi' }, totals: { balance: 8_500_000 }, school: { bankAccounts: ACCOUNTS } })

    // Another family's child, a removed child, another school's child
    const other = await invoiceFixture()
    for (const id of [f.students.bola.id, f.students.gone.id, other.students.ada.id]) {
      expect((await http.get(f, f.cookies.parent, `/api/me/children/${id}/invoice`)).status).toBe(404)
    }
    expect((await http.get(f, f.cookies.bursar, `/api/me/children/${f.students.ada.id}/invoice`)).status).toBe(403)
  })

  it('says when the term has no bill yet (404)', async () => {
    const f = await invoiceFixture()
    const res = await http.get(f, f.cookies.parent, `/api/me/children/${f.students.ada.id}/invoice?termId=${f.second.id}`)
    expect(res.status).toBe(404)
    expect((await res.json()).message).toBe('No bill for this term yet')
  })

  it('works for a second guardian too', async () => {
    const f = await invoiceFixture()
    const coGuardian = await createGuardian(db, f.school)
    await db.insert(studentGuardians).values({ schoolId: f.school.id, studentId: f.students.ada.id, guardianId: coGuardian.id })
    const cookie = await app.login(hostOf(f.school.slug), coGuardian.email!, DEFAULT_TEST_PASSWORD)
    expect((await http.get(f, cookie, `/api/me/children/${f.students.ada.id}/invoice`)).status).toBe(200)
  })
})

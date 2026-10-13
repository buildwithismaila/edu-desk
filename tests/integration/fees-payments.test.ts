import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { bills, payments } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'
import { type FeesFixture, feesFixture, feesRequests } from '../helpers/fees-fixture'

let db: Db
let app: ReturnType<typeof createTestApp>
let http: ReturnType<typeof feesRequests>

beforeAll(async () => {
  db = await createTestDb()
  app = createTestApp(db)
  http = feesRequests(app)
})

/** A fixture with this term's bills generated; Ada's JSS 1 bill is ₦87,500 (8,750,000 kobo). */
async function withBills() {
  const f = await feesFixture(db, app)
  await http.post(f, f.cookies.bursar, '/api/fees/bills/generate', { termId: f.term.id })
  const billOf = async (student: { id: string }) => (await db.select().from(bills).where(and(eq(bills.studentId, student.id), eq(bills.termId, f.term.id))))[0]!
  return { ...f, adaBill: await billOf(f.students.ada), bolaBill: await billOf(f.students.bola), billOf }
}
type Fixture = Awaited<ReturnType<typeof withBills>>

const pay = (f: FeesFixture, cookie: string, body: Record<string, unknown>) =>
  http.post(f, cookie, '/api/fees/payments', { method: 'cash', paidOn: '2026-10-12', ...body })

describe('recording payments', () => {
  let f: Fixture
  beforeAll(async () => {
    f = await withBills()
  })

  it('records a partial payment with the next receipt number and the new balance', async () => {
    const res = await pay(f, f.cookies.bursar, { billId: f.adaBill.id, amount: '20,000', method: 'transfer', reference: 'TRF-001' })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({
      receiptNumber: 'RCT/2026/000001',
      amountKobo: 2_000_000,
      method: 'transfer',
      reference: 'TRF-001',
      paidOn: '2026-10-12',
      channel: 'manual',
      receivedBy: 'Fatima Bello',
      student: { name: 'Ada Obi', admissionNumber: f.students.ada.admissionNumber },
      classLabel: 'JSS 1A',
      term: 'First Term 2026/2027',
      balanceKobo: 6_750_000,
      reversal: null,
    })
  })

  it('takes the balance to zero, then into credit', async () => {
    expect((await (await pay(f, f.cookies.admin, { billId: f.adaBill.id, amount: '67,500' })).json())).toMatchObject({ receiptNumber: 'RCT/2026/000002', balanceKobo: 0 })
    expect((await (await pay(f, f.cookies.bursar, { billId: f.adaBill.id, amount: '1,000' })).json()).balanceKobo).toBe(-100_000)
  })

  it('gives concurrent payments unique, consecutive receipt numbers', async () => {
    const results = await Promise.all([1, 2, 3, 4, 5].map(n => pay(f, f.cookies.bursar, { billId: f.bolaBill.id, amount: String(n * 100) })))
    const numbers = (await Promise.all(results.map(r => r.json()))).map((p: { receiptNumber: string }) => p.receiptNumber).sort()
    expect(numbers).toEqual(['RCT/2026/000004', 'RCT/2026/000005', 'RCT/2026/000006', 'RCT/2026/000007', 'RCT/2026/000008'])
  })

  it('numbers each year separately', async () => {
    expect((await (await pay(f, f.cookies.bursar, { billId: f.bolaBill.id, amount: '100', paidOn: '2025-12-30' })).json()).receiptNumber).toBe('RCT/2025/000001')
  })

  it('refuses a future date, a zero amount, an unknown method and an unknown bill', async () => {
    const future = await pay(f, f.cookies.bursar, { billId: f.adaBill.id, amount: '100', paidOn: '2099-01-01' })
    expect(future.status).toBe(400)
    expect((await future.json()).data.fieldErrors.paidOn).toEqual(['The payment date can\'t be in the future'])
    expect((await pay(f, f.cookies.bursar, { billId: f.adaBill.id, amount: '0' })).status).toBe(400)
    expect((await pay(f, f.cookies.bursar, { billId: f.adaBill.id, amount: '100', method: 'cheque' })).status).toBe(400)
    expect((await pay(f, f.cookies.bursar, { billId: '00000000-0000-4000-8000-000000000000', amount: '100' })).status).toBe(404)
  })
})

describe('reversing payments', () => {
  it('reverses once with a reason; the money leaves the balance and the row stays', async () => {
    const f = await withBills()
    const payment = await (await pay(f, f.cookies.bursar, { billId: f.adaBill.id, amount: '50,000' })).json()

    expect((await http.post(f, f.cookies.bursar, `/api/fees/payments/${payment.id}/reverse`, { reason: 'x' })).status).toBe(400)
    const res = await http.post(f, f.cookies.bursar, `/api/fees/payments/${payment.id}/reverse`, { reason: 'Recorded against the wrong student' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ balanceKobo: 8_750_000, reversal: { reason: 'Recorded against the wrong student', by: 'Fatima Bello' } })

    const again = await http.post(f, f.cookies.bursar, `/api/fees/payments/${payment.id}/reverse`, { reason: 'Again please' })
    expect(again.status).toBe(409)
    expect((await again.json()).message).toBe('This payment is already reversed')
    const [row] = await db.select().from(payments).where(eq(payments.id, payment.id))
    expect(row).toMatchObject({ amountKobo: 5_000_000, receiptNumber: 'RCT/2026/000001', reversalReason: 'Recorded against the wrong student' })
    expect((await http.post(f, f.cookies.bursar, '/api/fees/payments/00000000-0000-4000-8000-000000000000/reverse', { reason: 'Nothing here' })).status).toBe(404)
  })

  it('has no way to edit or delete a payment', async () => {
    const f = await withBills()
    const payment = await (await pay(f, f.cookies.admin, { billId: f.adaBill.id, amount: '50,000' })).json()
    const [before] = await db.select().from(payments).where(eq(payments.id, payment.id))

    // No such routes: unknown /api routes are 404 (the test app behaves like Nitro here)
    expect((await http.patch(f, f.cookies.admin, `/api/fees/payments/${payment.id}`, { amount: '1' })).status).toBe(404)
    expect((await http.put(f, f.cookies.admin, `/api/fees/payments/${payment.id}`, { amount: '1' })).status).toBe(404)
    expect((await http.del(f, f.cookies.admin, `/api/fees/payments/${payment.id}`)).status).toBe(404)
    expect((await db.select().from(payments).where(eq(payments.id, payment.id)))[0]).toEqual(before)
  })
})

describe('the student\'s fees', () => {
  it('shows the bill (lines, payments with reversals, totals) and a ledger across terms', async () => {
    const f = await withBills()
    const first = await (await pay(f, f.cookies.bursar, { billId: f.adaBill.id, amount: '30,000', paidOn: '2026-10-01' })).json()
    await pay(f, f.cookies.bursar, { billId: f.adaBill.id, amount: '10,000', paidOn: '2026-10-05' })
    await http.post(f, f.cookies.bursar, `/api/fees/payments/${first.id}/reverse`, { reason: 'Bounced transfer' })

    const body = await (await http.get(f, f.cookies.principal, `/api/students/${f.students.ada.id}/fees`)).json()
    expect(body.student).toMatchObject({ name: 'Ada Obi', removed: false })
    expect(body.term.label).toBe('First Term 2026/2027')
    expect(body.bill.totals).toMatchObject({ itemsTotal: 8_750_000, paid: 1_000_000, reversed: 3_000_000, balance: 7_750_000 })
    expect(body.bill.payments.map((p: { receiptNumber: string, reversed: boolean }) => [p.receiptNumber, p.reversed])).toEqual([['RCT/2026/000001', true], ['RCT/2026/000002', false]])
    expect(body.bill.optionalItems).toEqual([{ id: f.items.bus.id, name: 'Bus', amountKobo: 2_500_000, selected: false }])
    expect(body.ledger.at(-1).balance).toBe(7_750_000)
    expect(body.ledger.map((e: { description: string }) => e.description)).toContain('Reversal of RCT/2026/000001: Bounced transfer')
  })

  it('has no bill for a term without one', async () => {
    const f = await withBills()
    expect((await (await http.get(f, f.cookies.bursar, `/api/students/${f.students.ada.id}/fees?termId=${f.second.id}`)).json()).bill).toBeNull()
  })
})

describe('permissions', () => {
  it('lets only admin and bursar record or reverse; the principal reads; teachers and parents can\'t', async () => {
    const f = await withBills()
    const payment = await (await pay(f, f.cookies.bursar, { billId: f.adaBill.id, amount: '100' })).json()
    for (const role of ['principal', 'teacher', 'parent'] as const) {
      expect((await pay(f, f.cookies[role], { billId: f.adaBill.id, amount: '100' })).status, role).toBe(403)
      expect((await http.post(f, f.cookies[role], `/api/fees/payments/${payment.id}/reverse`, { reason: 'Not allowed' })).status, role).toBe(403)
    }
    expect((await http.get(f, f.cookies.principal, `/api/fees/payments/${payment.id}`)).status).toBe(200)
    for (const role of ['teacher', 'parent'] as const) {
      expect((await http.get(f, f.cookies[role], `/api/fees/payments/${payment.id}`)).status, role).toBe(403)
      expect((await http.get(f, f.cookies[role], `/api/students/${f.students.ada.id}/fees`)).status, role).toBe(403)
    }
    expect((await http.get(f, undefined, `/api/fees/payments/${payment.id}`)).status).toBe(401)
  })
})

describe('tenant isolation', () => {
  it('treats another school\'s bills, payments and students as not found, changing nothing', async () => {
    const a = await withBills()
    const b = await withBills()
    const payment = await (await pay(a, a.cookies.bursar, { billId: a.adaBill.id, amount: '100' })).json()

    expect((await pay(b, b.cookies.bursar, { billId: a.adaBill.id, amount: '100' })).status).toBe(404)
    expect((await http.post(b, b.cookies.bursar, `/api/fees/payments/${payment.id}/reverse`, { reason: 'Not mine' })).status).toBe(404)
    expect((await http.get(b, b.cookies.bursar, `/api/fees/payments/${payment.id}`)).status).toBe(404)
    expect((await http.get(b, b.cookies.bursar, `/api/students/${a.students.ada.id}/fees`)).status).toBe(404)
    expect(await db.select().from(payments).where(eq(payments.billId, a.adaBill.id))).toHaveLength(1)
    expect((await db.select().from(payments).where(eq(payments.id, payment.id)))[0]!.reversedAt).toBeNull()
    expect((await pay(b, a.cookies.bursar, { billId: b.adaBill.id, amount: '100' })).status).toBe(401)
  })
})

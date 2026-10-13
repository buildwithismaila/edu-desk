import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { bills } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'
import { type FeesFixture, feesFixture, feesRequests } from '../helpers/fees-fixture'

let db: Db
let app: ReturnType<typeof createTestApp>
let http: ReturnType<typeof feesRequests>
let f: FeesFixture

/**
 * Bills: Ada, Bola (JSS 1A) and Chidi (JSS 1B) ₦87,500 each; Dayo (SSS 1A) ₦95,000. Total ₦357,500.
 *   Ada pays ₦20,000 (transfer, 01/10) → owes ₦67,500
 *   Bola pays ₦87,500 (cash, 01/10) → settled
 *   Chidi pays ₦10,000 (POS, 02/10), reversed → owes ₦87,500
 *   Dayo pays ₦100,000 (transfer, 02/10) → ₦5,000 credit
 * Collected ₦207,500; outstanding ₦155,000; credit ₦5,000; 357,500 − 207,500 = 155,000 − 5,000
 */
beforeAll(async () => {
  db = await createTestDb()
  app = createTestApp(db)
  http = feesRequests(app)
  f = await feesFixture(db, app)
  await http.post(f, f.cookies.bursar, '/api/fees/bills/generate', { termId: f.term.id })
  const billOf = async (student: { id: string }) => (await db.select().from(bills).where(and(eq(bills.studentId, student.id), eq(bills.termId, f.term.id))))[0]!
  const pay = async (student: { id: string }, amount: string, method: string, paidOn: string) =>
    (await http.post(f, f.cookies.bursar, '/api/fees/payments', { billId: (await billOf(student)).id, amount, method, paidOn })).json()
  await pay(f.students.ada, '20,000', 'transfer', '2026-10-01')
  await pay(f.students.bola, '87,500', 'cash', '2026-10-01')
  const chidi = await pay(f.students.chidi, '10,000', 'pos', '2026-10-02')
  await http.post(f, f.cookies.bursar, `/api/fees/payments/${chidi.id}/reverse`, { reason: 'Card declined later' })
  await pay(f.students.dayo, '100,000', 'transfer', '2026-10-02')
})

describe('debtors', () => {
  it('lists students who owe, largest first, with the total', async () => {
    const body = await (await http.get(f, f.cookies.principal, '/api/fees/debtors')).json()
    expect(body).toMatchObject({ count: 2, totalKobo: 15_500_000, term: { label: 'First Term 2026/2027' } })
    expect(body.students.map((s: { name: string, classLabel: string, balance: number }) => [s.name, s.classLabel, s.balance])).toEqual([
      ['Chidi Eze', 'JSS 1B', 8_750_000],
      ['Ada Obi', 'JSS 1A', 6_750_000],
    ])
  })

  it('narrows to an arm', async () => {
    const body = await (await http.get(f, f.cookies.bursar, `/api/fees/debtors?classArmId=${f.jss1a.id}`)).json()
    expect(body.students.map((s: { name: string }) => s.name)).toEqual(['Ada Obi'])
  })
})

describe('collections', () => {
  it('reconciles expected, collected, outstanding and credit, by level, method and day', async () => {
    const body = await (await http.get(f, f.cookies.principal, '/api/fees/collections')).json()
    expect(body).toMatchObject({ bills: 4, expectedKobo: 35_750_000, collectedKobo: 20_750_000, outstandingKobo: 15_500_000, creditKobo: 500_000 })
    expect(body.expectedKobo - body.collectedKobo).toBe(body.outstandingKobo - body.creditKobo)
    expect(body.byLevel).toEqual([
      { level: 'JSS 1', bills: 3, expectedKobo: 26_250_000, collectedKobo: 10_750_000 },
      { level: 'SSS 1', bills: 1, expectedKobo: 9_500_000, collectedKobo: 10_000_000 },
    ])
    // The reversed POS payment isn't counted
    expect(body.byMethod).toEqual([
      { method: 'cash', count: 1, amountKobo: 8_750_000 },
      { method: 'transfer', count: 2, amountKobo: 12_000_000 },
      { method: 'pos', count: 0, amountKobo: 0 },
    ])
    expect(body.byDay).toEqual([{ date: '2026-10-01', amountKobo: 10_750_000 }, { date: '2026-10-02', amountKobo: 10_000_000 }])
  })
})

describe('permissions and isolation', () => {
  it('keeps reports from teachers and parents and from other schools', async () => {
    for (const path of ['/api/fees/debtors', '/api/fees/collections']) {
      expect((await http.get(f, f.cookies.teacher, path)).status).toBe(403)
      expect((await http.get(f, f.cookies.parent, path)).status).toBe(403)
      expect((await http.get(f, undefined, path)).status).toBe(401)
    }
    const other = await feesFixture(db, app)
    expect((await http.get(other, other.cookies.bursar, `/api/fees/collections?termId=${f.term.id}`)).status).toBe(404)
    expect((await (await http.get(other, other.cookies.bursar, '/api/fees/debtors')).json()).count).toBe(0)
  })
})

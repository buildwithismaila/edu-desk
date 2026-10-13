import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { billLines, bills, feeItems } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createBill, createPayment } from '../factories/fees'
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

const billOf = async (f: FeesFixture, student: { id: string }, term = f.term) =>
  (await db.select().from(bills).where(and(eq(bills.studentId, student.id), eq(bills.termId, term.id))))[0]
const linesOf = async (bill: { id: string }) =>
  (await db.select().from(billLines).where(eq(billLines.billId, bill.id))).map(l => [l.kind, l.description, l.amountKobo]).sort()
const generate = (f: FeesFixture, body: Record<string, unknown> = {}) => http.post(f, f.cookies.bursar, '/api/fees/bills/generate', { termId: f.term.id, ...body })
const refresh = (f: FeesFixture, body: Record<string, unknown> = {}) => http.post(f, f.cookies.bursar, '/api/fees/bills/refresh', { termId: f.term.id, ...body })

describe('permissions', () => {
  it('lets admin and bursar generate, refresh and change bills; the principal only reads', async () => {
    const f = await feesFixture(db, app)
    for (const role of ['principal', 'teacher', 'parent'] as const) {
      expect((await http.post(f, f.cookies[role], '/api/fees/bills/generate', { termId: f.term.id })).status, role).toBe(403)
      expect((await http.post(f, f.cookies[role], '/api/fees/bills/refresh', { termId: f.term.id })).status, role).toBe(403)
    }
    expect((await http.post(f, f.cookies.admin, '/api/fees/bills/generate', { termId: f.term.id })).status).toBe(200)
    const bill = (await billOf(f, f.students.ada))!
    expect((await http.put(f, f.cookies.principal, `/api/fees/bills/${bill.id}/optional-items`, { feeItemIds: [] })).status).toBe(403)
    expect((await http.post(f, f.cookies.principal, `/api/fees/bills/${bill.id}/discounts`, { kind: 'fixed', amount: '100', reason: 'x1' })).status).toBe(403)
    expect((await http.get(f, f.cookies.principal, '/api/fees/bills')).status).toBe(200)
    expect((await http.get(f, f.cookies.teacher, '/api/fees/bills')).status).toBe(403)
    expect((await http.get(f, undefined, '/api/fees/bills')).status).toBe(401)
  })
})

describe('generate', () => {
  it('bills every active enrolled student with their level\'s compulsory items; running it again creates nothing', async () => {
    const f = await feesFixture(db, app)

    const first = await generate(f)
    expect(await first.json()).toEqual({ created: 4, existing: 0 })
    expect(await linesOf((await billOf(f, f.students.ada))!)).toEqual([['item', 'PTA', 250_000], ['item', 'Tuition', 8_500_000]])
    expect(await linesOf((await billOf(f, f.students.dayo))!)).toEqual([['item', 'Tuition', 9_500_000]])
    expect(await billOf(f, f.students.gone)).toBeUndefined()
    expect(await billOf(f, f.students.ada)).toMatchObject({ classLevelId: f.jss1.id, classArmId: f.jss1a.id, generatedById: f.users.bursar.id })

    expect(await (await generate(f)).json()).toEqual({ created: 0, existing: 4 })
    expect(await db.select().from(bills).where(eq(bills.termId, f.term.id))).toHaveLength(4)
  })

  it('generates for one arm only', async () => {
    const f = await feesFixture(db, app)
    expect(await (await generate(f, { classArmId: f.jss1a.id })).json()).toEqual({ created: 2, existing: 0 })
    expect(await billOf(f, f.students.chidi)).toBeUndefined()
  })

  it('carries the previous term\'s balance forward: arrears or credit', async () => {
    const f = await feesFixture(db, app)
    // Last session's third term: Ada owes ₦10,000; Bola overpaid ₦2,000
    const adaOld = await createBill(db, f.school, { term: f.lastThird, student: f.students.ada, level: f.jss1, arm: f.jss1a, items: [{ name: 'Tuition', amountKobo: 5_000_000 }] })
    await createPayment(db, f.school, { bill: adaOld, student: f.students.ada, amountKobo: 4_000_000 })
    const bolaOld = await createBill(db, f.school, { term: f.lastThird, student: f.students.bola, level: f.jss1, arm: f.jss1a, items: [{ name: 'Tuition', amountKobo: 5_000_000 }] })
    await createPayment(db, f.school, { bill: bolaOld, student: f.students.bola, amountKobo: 5_200_000 })

    await generate(f)

    expect(await linesOf((await billOf(f, f.students.ada))!)).toContainEqual(['carry_forward', 'Arrears brought forward (Third Term 2025/2026)', 1_000_000])
    expect(await linesOf((await billOf(f, f.students.bola))!)).toContainEqual(['carry_forward', 'Credit brought forward (Third Term 2025/2026)', -200_000])
    expect((await linesOf((await billOf(f, f.students.chidi))!)).some(l => l[0] === 'carry_forward')).toBe(false)
  })

  it('needs a term of the school', async () => {
    const f = await feesFixture(db, app)
    expect((await http.post(f, f.cookies.bursar, '/api/fees/bills/generate', { termId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404)
    expect((await http.post(f, f.cookies.bursar, '/api/fees/bills/generate', {})).status).toBe(400)
  })
})

describe('refresh', () => {
  it('updates item lines on bills without payments, keeps bills with payments, and re-syncs carry-forward on all', async () => {
    const f = await feesFixture(db, app)
    const adaOld = await createBill(db, f.school, { term: f.lastThird, student: f.students.ada, level: f.jss1, arm: f.jss1a, items: [{ name: 'Tuition', amountKobo: 5_000_000 }] })
    await generate(f)
    const adaBill = (await billOf(f, f.students.ada))!
    await createPayment(db, f.school, { bill: adaBill, student: f.students.ada, amountKobo: 1_000_000 })
    // Tuition goes up after billing; Ada also pays her old bill off
    await db.update(feeItems).set({ amountKobo: 9_000_000 }).where(eq(feeItems.id, f.items.tuition.id))
    await createPayment(db, f.school, { bill: adaOld, student: f.students.ada, amountKobo: 5_000_000 })

    const res = await refresh(f)
    expect(await res.json()).toEqual({ refreshed: 3, kept: 1 })
    expect(await linesOf((await billOf(f, f.students.bola))!)).toContainEqual(['item', 'Tuition', 9_000_000])
    // Ada has a payment: her items stay; her arrears are gone now she paid
    expect(await linesOf(adaBill)).toEqual([['item', 'PTA', 250_000], ['item', 'Tuition', 8_500_000]])
  })
})

describe('GET /api/fees/bills', () => {
  it('lists the term\'s bills with totals, searchable', async () => {
    const f = await feesFixture(db, app)
    await generate(f)
    await createPayment(db, f.school, { bill: (await billOf(f, f.students.ada))!, student: f.students.ada, amountKobo: 2_000_000 })

    const body = await (await http.get(f, f.cookies.principal, '/api/fees/bills')).json()
    expect(body).toMatchObject({ total: 4, page: 1, pageSize: 25, term: { label: 'First Term 2026/2027' } })
    expect(body.items.find((b: { name: string }) => b.name === 'Ada Obi')).toMatchObject({ classLabel: 'JSS 1A', billed: 8_750_000, paid: 2_000_000, balance: 6_750_000 })

    const search = await (await http.get(f, f.cookies.bursar, '/api/fees/bills?search=lawal')).json()
    expect(search.items.map((b: { name: string }) => b.name)).toEqual(['Dayo Lawal'])
    const arm = await (await http.get(f, f.cookies.bursar, `/api/fees/bills?classArmId=${f.jss1b.id}`)).json()
    expect(arm.items.map((b: { name: string }) => b.name)).toEqual(['Chidi Eze'])
  })
})

describe('optional items and discounts', () => {
  it('adds and removes optional items, refusing items that aren\'t optional for the class', async () => {
    const f = await feesFixture(db, app)
    await generate(f)
    const bill = (await billOf(f, f.students.ada))!
    const set = (feeItemIds: string[]) => http.put(f, f.cookies.bursar, `/api/fees/bills/${bill.id}/optional-items`, { feeItemIds })

    const res = await set([f.items.bus.id])
    expect(res.status).toBe(200)
    expect((await res.json()).totals).toMatchObject({ itemsTotal: 11_250_000, balance: 11_250_000 })
    // Refresh keeps the chosen optional item
    await refresh(f)
    expect(await linesOf(bill)).toContainEqual(['item', 'Bus', 2_500_000])

    expect((await set([f.items.tuition.id])).status).toBe(400)
    expect((await set([f.items.sssTuition.id])).status).toBe(400)
    expect((await (await set([])).json()).totals.itemsTotal).toBe(8_750_000)
  })

  it('adds fixed and percent discounts, capped at the items, and removes them', async () => {
    const f = await feesFixture(db, app)
    await generate(f)
    const bill = (await billOf(f, f.students.ada))!
    const add = (body: unknown) => http.post(f, f.cookies.bursar, `/api/fees/bills/${bill.id}/discounts`, body)

    const percent = await add({ kind: 'percent', percent: 10, reason: 'Sibling discount' })
    expect(percent.status).toBe(201)
    expect((await percent.json()).discounts).toEqual([expect.objectContaining({ kind: 'percent', value: 1000, reason: 'Sibling discount', amountKobo: 875_000 })])

    const capped = await (await add({ kind: 'fixed', amount: '100,000', reason: 'Scholarship' })).json()
    expect(capped.discounts.map((d: { amountKobo: number }) => d.amountKobo)).toEqual([875_000, 7_875_000])
    expect(capped.totals).toMatchObject({ discountTotal: 8_750_000, balance: 0 })

    const removed = await (await http.del(f, f.cookies.bursar, `/api/fees/discounts/${capped.discounts[1].id}`)).json()
    expect(removed.totals.balance).toBe(7_875_000)
    expect((await http.del(f, f.cookies.bursar, `/api/fees/discounts/${capped.discounts[1].id}`)).status).toBe(404)
    expect((await add({ kind: 'percent', percent: 150, reason: 'Too much' })).status).toBe(400)
  })
})

describe('tenant isolation', () => {
  it('treats another school\'s term, arm, bill and discount as not found', async () => {
    const a = await feesFixture(db, app)
    const b = await feesFixture(db, app)
    await generate(a)
    const aBill = (await billOf(a, a.students.ada))!
    const discount = await (await http.post(a, a.cookies.bursar, `/api/fees/bills/${aBill.id}/discounts`, { kind: 'fixed', amount: '100', reason: 'Test' })).json()

    expect((await http.post(b, b.cookies.bursar, '/api/fees/bills/generate', { termId: a.term.id })).status).toBe(404)
    expect((await http.post(b, b.cookies.bursar, '/api/fees/bills/generate', { termId: b.term.id, classArmId: a.jss1a.id })).status).toBe(404)
    expect((await http.put(b, b.cookies.bursar, `/api/fees/bills/${aBill.id}/optional-items`, { feeItemIds: [] })).status).toBe(404)
    expect((await http.post(b, b.cookies.bursar, `/api/fees/bills/${aBill.id}/discounts`, { kind: 'fixed', amount: '100', reason: 'Test' })).status).toBe(404)
    expect((await http.del(b, b.cookies.bursar, `/api/fees/discounts/${discount.discounts[0].id}`)).status).toBe(404)
    expect((await (await http.get(b, b.cookies.bursar, '/api/fees/bills')).json()).total).toBe(0)
    expect((await http.get(b, a.cookies.bursar, '/api/fees/bills')).status).toBe(401)
  })
})

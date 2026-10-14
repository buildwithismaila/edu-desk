import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { billBalance } from '~~/shared/utils/fees'
import { billLines, bills, discounts, feeItems, payments, receiptCounters, schools, students, terms } from '~~/server/database/schema'
import { seed } from '~~/server/database/seed/seed'
import type { Db } from '~~/server/utils/db'
import { createTestDb } from '../helpers/db'

let db: Db
let ids: Record<string, string>

beforeAll(async () => {
  db = await createTestDb()
  await seed(db)
  const rows = await db.select({ id: schools.id, slug: schools.slug }).from(schools)
  ids = Object.fromEntries(rows.map(r => [r.slug, r.id]))
})

/** The current balance of a Greenfield student's bills, by admission number. */
async function balanceOf(admissionNumber: string) {
  const [student] = await db.select().from(students).where(and(eq(students.schoolId, ids.greenfield!), eq(students.admissionNumber, admissionNumber)))
  const [term] = await db.select().from(terms).where(and(eq(terms.schoolId, ids.greenfield!), eq(terms.isCurrent, true)))
  const [current] = await db.select().from(bills).where(and(eq(bills.studentId, student!.id), eq(bills.termId, term!.id)))
  if (!current) throw new Error(`No current bill for ${admissionNumber}`)
  const lines = await db.select().from(billLines).where(eq(billLines.billId, current.id))
  return {
    lines,
    ...billBalance({
      lines,
      discounts: await db.select().from(discounts).where(eq(discounts.billId, current.id)),
      payments: (await db.select().from(payments).where(eq(payments.billId, current.id))).map(p => ({ amountKobo: p.amountKobo, reversed: !!p.reversedAt })),
    }),
  }
}

const counts = async () => ({
  items: (await db.select().from(feeItems)).length,
  bills: (await db.select().from(bills)).length,
  lines: (await db.select().from(billLines)).length,
  discounts: (await db.select().from(discounts)).length,
  payments: (await db.select().from(payments)).length,
})

describe('demo seed: fees', () => {
  it('bills every enrolled Greenfield student this term from their level\'s compulsory items', async () => {
    const greenfieldBills = await db.select().from(bills).where(eq(bills.schoolId, ids.greenfield!))
    // 43 this term + 2 from last session's third term
    expect(greenfieldBills).toHaveLength(45)
    // JSS: Tuition 85,000 + Levy 10,000 + PTA 2,500 + Books 15,000 (Bus is optional) = ₦112,500
    expect((await balanceOf('GFA/2026/0010')).itemsTotal).toBe(11_250_000)
  })

  it('carries last session\'s arrears and credit forward', async () => {
    // Tobi: ₦82,500 billed, ₦50,000 paid → owes ₦32,500; Fatima paid ₦90,000 → ₦7,500 credit
    const tobi = await balanceOf('GFA/2026/0002')
    expect(tobi.lines.find(l => l.kind === 'carry_forward')).toMatchObject({ amountKobo: 3_250_000, description: 'Arrears brought forward (Third Term 2025/2026)' })
    expect(tobi.balance).toBe(11_250_000 + 3_250_000)
    const fatima = await balanceOf('GFA/2026/0003')
    expect(fatima.lines.find(l => l.kind === 'carry_forward')!.amountKobo).toBe(-750_000)
  })

  it('records the demo payments: paid in full after a discount, credit, partly paid, and a reversal', async () => {
    // Chidera: 10% sibling discount, then paid the rest
    expect(await balanceOf('GFA/2026/0001')).toMatchObject({ discountTotal: 1_125_000, balance: 0 })
    // Emeka overpaid by ₦5,000
    expect((await balanceOf('GFA/2026/0004')).balance).toBe(-500_000)
    // Ifeanyi: ₦40,000 reversed, ₦30,000 counts
    expect(await balanceOf('GFA/2026/0006')).toMatchObject({ paid: 3_000_000, reversed: 4_000_000, balance: 8_250_000 })
    expect((await balanceOf('GFA/2026/0010')).balance).toBe(11_250_000)

    const greenfieldPayments = await db.select().from(payments).where(eq(payments.schoolId, ids.greenfield!))
    expect(greenfieldPayments).toHaveLength(9)
    expect(greenfieldPayments.filter(p => p.reversedAt)).toEqual([expect.objectContaining({ reversalReason: 'Recorded against the wrong student' })])
    expect(greenfieldPayments.map(p => p.receiptNumber).sort()[0]).toBe('RCT/2026/000001')
    const [counter] = await db.select().from(receiptCounters).where(eq(receiptCounters.schoolId, ids.greenfield!))
    expect(counter!.lastNumber).toBe(9)
  })

  it('gives Sunrise its own items, bills and a payment', async () => {
    expect(await db.select().from(bills).where(eq(bills.schoolId, ids.sunrise!))).toHaveLength(3)
    expect(await db.select().from(payments).where(eq(payments.schoolId, ids.sunrise!))).toHaveLength(1)
  })

  it('is re-runnable without duplicates or new receipt numbers', async () => {
    const before = await counts()
    await seed(db)
    expect(await counts()).toEqual(before)
    expect((await balanceOf('GFA/2026/0004')).balance).toBe(-500_000)
  })
})

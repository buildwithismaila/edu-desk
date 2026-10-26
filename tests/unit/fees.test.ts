import { describe, expect, it } from 'vitest'
import { discountSchema, feeItemsSchema, paymentSchema, reverseSchema } from '~~/shared/schemas/fees'
import { billBalance, carryForwardLine, discountAmounts, formatReceiptNumber, ledger, owedByTerm } from '~~/shared/utils/fees'

const ID = '11111111-1111-4111-8111-111111111111'
const item = (amountKobo: number) => ({ kind: 'item' as const, amountKobo })
const carry = (amountKobo: number) => ({ kind: 'carry_forward' as const, amountKobo })
const paid = (amountKobo: number, reversed = false) => ({ amountKobo, reversed })

// ₦85,000 tuition + ₦10,000 levy + ₦2,500 PTA = ₦97,500 = 9,750,000 kobo
const ITEMS = [item(8_500_000), item(1_000_000), item(250_000)]

describe('billBalance', () => {
  it('owes the whole bill when nothing is paid', () => {
    expect(billBalance({ lines: ITEMS, discounts: [], payments: [] })).toEqual({
      itemsTotal: 9_750_000, carryForward: 0, discountTotal: 0, billed: 9_750_000, paid: 0, reversed: 0, balance: 9_750_000,
    })
  })

  it('takes off partial and exact payments', () => {
    expect(billBalance({ lines: ITEMS, discounts: [], payments: [paid(5_000_000)] }).balance).toBe(4_750_000)
    expect(billBalance({ lines: ITEMS, discounts: [], payments: [paid(5_000_000), paid(4_750_000)] }).balance).toBe(0)
  })

  it('turns an overpayment into credit (a negative balance)', () => {
    expect(billBalance({ lines: ITEMS, discounts: [], payments: [paid(10_000_000)] }).balance).toBe(-250_000)
  })

  it('applies fixed and percent discounts to the items, percent in basis points rounded to the kobo', () => {
    expect(billBalance({ lines: ITEMS, discounts: [{ kind: 'fixed', value: 500_000 }], payments: [] }).balance).toBe(9_250_000)
    // 10% of 9,750,000 = 975,000
    expect(billBalance({ lines: ITEMS, discounts: [{ kind: 'percent', value: 1000 }], payments: [] }).discountTotal).toBe(975_000)
    // 12.5% of 333 kobo = 41.625 → 42 (half up)
    expect(billBalance({ lines: [item(333)], discounts: [{ kind: 'percent', value: 1250 }], payments: [] }).discountTotal).toBe(42)
  })

  it('adds several discounts but never beyond the items (no credit from a discount)', () => {
    const r = billBalance({ lines: [...ITEMS, carry(2_000_000)], discounts: [{ kind: 'percent', value: 5000 }, { kind: 'fixed', value: 9_000_000 }], payments: [] })
    expect(r.discountTotal).toBe(9_750_000)
    // Arrears are still owed in full
    expect(r.balance).toBe(2_000_000)
  })

  it('applies percent discounts to items only, not arrears', () => {
    expect(billBalance({ lines: [...ITEMS, carry(1_000_000)], discounts: [{ kind: 'percent', value: 1000 }], payments: [] })).toMatchObject({
      itemsTotal: 9_750_000, carryForward: 1_000_000, discountTotal: 975_000, billed: 10_750_000, balance: 9_775_000,
    })
  })

  it('carries a credit forward as a negative line', () => {
    expect(billBalance({ lines: [...ITEMS, carry(-250_000)], discounts: [], payments: [] }).balance).toBe(9_500_000)
  })

  it('leaves reversed payments out of what is paid', () => {
    expect(billBalance({ lines: ITEMS, discounts: [], payments: [paid(5_000_000), paid(3_000_000, true)] })).toMatchObject({
      paid: 5_000_000, reversed: 3_000_000, balance: 4_750_000,
    })
    // Reversing an overpayment removes the credit
    expect(billBalance({ lines: ITEMS, discounts: [], payments: [paid(9_750_000), paid(1_000_000, true)] }).balance).toBe(0)
  })

  it('keeps every total an integer', () => {
    const r = billBalance({ lines: [item(1), item(2), carry(3)], discounts: [{ kind: 'percent', value: 3333 }], payments: [paid(1)] })
    expect(Object.values(r).every(Number.isInteger)).toBe(true)
  })
})

describe('discountAmounts', () => {
  it('gives each discount its amount, the later ones trimmed by the cap', () => {
    expect(discountAmounts(1_000_000, [{ kind: 'percent', value: 5000 }, { kind: 'fixed', value: 800_000 }, { kind: 'fixed', value: 100 }])).toEqual([500_000, 500_000, 0])
  })
})

describe('carryForwardLine', () => {
  it('has no line at zero, arrears when owing, credit when overpaid', () => {
    expect(carryForwardLine(0, 'Third Term 2025/2026')).toBeNull()
    expect(carryForwardLine(1_500_000, 'Third Term 2025/2026')).toEqual({ kind: 'carry_forward', description: 'Arrears brought forward (Third Term 2025/2026)', amountKobo: 1_500_000 })
    expect(carryForwardLine(-250_000, 'Third Term 2025/2026')).toEqual({ kind: 'carry_forward', description: 'Credit brought forward (Third Term 2025/2026)', amountKobo: -250_000 })
  })
})

describe('ledger', () => {
  it('lists charges, discounts, payments and reversals in date order with a running balance (carry-forward lines skipped)', () => {
    const entries = ledger([
      {
        term: 'Third Term 2025/2026',
        date: '2026-04-27',
        lines: [{ kind: 'item', description: 'Tuition', amountKobo: 5_000_000 }],
        discounts: [],
        payments: [{ date: '2026-05-02', receiptNumber: 'RCT/2026/000001', amountKobo: 3_000_000, reversal: null }],
      },
      {
        term: 'First Term 2026/2027',
        date: '2026-09-14',
        lines: [
          { kind: 'item', description: 'Tuition', amountKobo: 6_000_000 },
          { kind: 'carry_forward', description: 'Arrears brought forward (Third Term 2025/2026)', amountKobo: 2_000_000 },
        ],
        discounts: [{ date: '2026-09-15', reason: 'Sibling discount', kind: 'percent', value: 1000 }],
        payments: [{ date: '2026-09-20', receiptNumber: 'RCT/2026/000050', amountKobo: 1_000_000, reversal: { date: '2026-09-21', reason: 'Wrong student' } }],
      },
    ])
    expect(entries.map(e => [e.date, e.description, e.debit, e.credit, e.balance])).toEqual([
      ['2026-04-27', 'Tuition (Third Term 2025/2026)', 5_000_000, 0, 5_000_000],
      ['2026-05-02', 'Payment RCT/2026/000001', 0, 3_000_000, 2_000_000],
      ['2026-09-14', 'Tuition (First Term 2026/2027)', 6_000_000, 0, 8_000_000],
      ['2026-09-15', 'Discount: Sibling discount', 0, 600_000, 7_400_000],
      ['2026-09-20', 'Payment RCT/2026/000050', 0, 1_000_000, 6_400_000],
      ['2026-09-21', 'Reversal of RCT/2026/000050: Wrong student', 1_000_000, 0, 7_400_000],
    ])
  })
})

describe('formatReceiptNumber', () => {
  it('pads to six digits', () => {
    expect(formatReceiptNumber(2026, 123)).toBe('RCT/2026/000123')
    expect(formatReceiptNumber(2026, 1_234_567)).toBe('RCT/2026/1234567')
  })
})

describe('schemas', () => {
  it('reads fee items with naira amounts, refusing duplicate names', () => {
    const parsed = feeItemsSchema.parse({ termId: ID, classLevelId: ID, items: [{ name: ' Tuition ', amount: '85,000', optional: false }, { name: 'Bus', amount: '25000', optional: true }] })
    expect(parsed.items).toEqual([{ name: 'Tuition', amountKobo: 8_500_000, optional: false }, { name: 'Bus', amountKobo: 2_500_000, optional: true }])
    expect(feeItemsSchema.safeParse({ termId: ID, classLevelId: ID, items: [{ name: 'Bus', amount: '1', optional: true }, { name: 'bus', amount: '2', optional: true }] }).success).toBe(false)
    expect(feeItemsSchema.safeParse({ termId: ID, classLevelId: ID, items: [{ name: 'Tuition', amount: '0', optional: false }] }).success).toBe(false)
  })

  it('reads fixed and percent discounts', () => {
    expect(discountSchema.parse({ kind: 'fixed', amount: '5,000', reason: 'Scholarship' })).toEqual({ kind: 'fixed', value: 500_000, reason: 'Scholarship' })
    expect(discountSchema.parse({ kind: 'percent', percent: 12.5, reason: 'Sibling' })).toEqual({ kind: 'percent', value: 1250, reason: 'Sibling' })
    expect(discountSchema.safeParse({ kind: 'percent', percent: 101, reason: 'Too much' }).success).toBe(false)
    expect(discountSchema.safeParse({ kind: 'fixed', amount: '5000', reason: '' }).success).toBe(false)
  })

  it('reads a payment and a reversal', () => {
    expect(paymentSchema.parse({ billId: ID, amount: '20,000', method: 'transfer', paidOn: '2026-10-12', reference: ' TRF123 ' }))
      .toEqual({ billId: ID, amountKobo: 2_000_000, method: 'transfer', paidOn: '2026-10-12', reference: 'TRF123' })
    expect(paymentSchema.safeParse({ billId: ID, amount: '0', method: 'cash', paidOn: '2026-10-12' }).success).toBe(false)
    expect(paymentSchema.safeParse({ billId: ID, amount: '100', method: 'cheque', paidOn: '2026-10-12' }).success).toBe(false)
    expect(reverseSchema.safeParse({ reason: 'x' }).success).toBe(false)
  })
})

describe('owedByTerm (results withheld until paid, Phase 10d)', () => {
  // ₦100,000 a term, in kobo
  const term = (termId: string, ownChargesKobo = 10_000_000) => ({ termId, ownChargesKobo })
  const owed = (bills: ReturnType<typeof term>[], outstanding: number) => Object.fromEntries(owedByTerm(bills, outstanding))

  it('owes nothing when the newest bill is paid or in credit', () => {
    expect(owed([term('t1'), term('t2')], 0)).toEqual({})
    expect(owed([term('t1'), term('t2')], -500_000)).toEqual({})
  })

  it('puts what is owed on the newest term first: paying clears the oldest debt', () => {
    // First term unpaid, second term billed with ₦100,000 arrears, ₦100,000 paid: the second term is owed
    expect(owed([term('t1'), term('t2')], 10_000_000)).toEqual({ t2: 10_000_000 })
  })

  it('reaches back to earlier terms when more than the newest term is owed', () => {
    expect(owed([term('t1'), term('t2'), term('t3')], 25_000_000)).toEqual({ t3: 10_000_000, t2: 10_000_000, t1: 5_000_000 })
  })

  it('owes part of a term when part of it is paid', () => {
    expect(owed([term('t1')], 4_500_000)).toEqual({ t1: 4_500_000 })
  })

  it('uses each term\'s own charges after discounts (a term with nothing to pay owes nothing)', () => {
    expect(owed([term('t1', 8_000_000), term('t2', 0), term('t3', 6_000_000)], 9_000_000)).toEqual({ t3: 6_000_000, t1: 3_000_000 })
  })

  it('keeps debt older than the first bill on the oldest term', () => {
    expect(owed([term('t1'), term('t2')], 23_000_000)).toEqual({ t2: 10_000_000, t1: 13_000_000 })
  })

  it('owes nothing without bills', () => {
    expect(owed([], 1_000)).toEqual({})
  })
})

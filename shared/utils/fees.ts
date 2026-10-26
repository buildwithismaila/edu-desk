// Bill balances, carry-forward and the ledger (docs/domain.md → Fees). Pure and in integer kobo.

export type BillLineKind = 'item' | 'carry_forward'
export type DiscountKind = 'fixed' | 'percent'
/** `value`: kobo for fixed, basis points (1% = 100) for percent */
export type DiscountRule = { kind: DiscountKind, value: number }

/**
 * What each discount takes off, in order: percent ones on the item total (half up, to the kobo); all of
 * them together never more than the items (a discount can't create credit or touch arrears).
 */
export function discountAmounts(itemsTotal: number, discounts: readonly DiscountRule[]) {
  let left = Math.max(itemsTotal, 0)
  return discounts.map((d) => {
    const amount = d.kind === 'fixed' ? d.value : Math.round((itemsTotal * d.value) / 10_000)
    const applied = Math.min(Math.max(amount, 0), left)
    left -= applied
    return applied
  })
}

/**
 * Balance = items + carry-forward − discounts − payments (reversed ones don't count). Negative = credit.
 */
export function billBalance({ lines, discounts, payments }: {
  lines: readonly { kind: BillLineKind, amountKobo: number }[]
  discounts: readonly DiscountRule[]
  payments: readonly { amountKobo: number, reversed: boolean }[]
}) {
  const itemsTotal = lines.filter(l => l.kind === 'item').reduce((sum, l) => sum + l.amountKobo, 0)
  const carryForward = lines.filter(l => l.kind === 'carry_forward').reduce((sum, l) => sum + l.amountKobo, 0)
  const discountTotal = discountAmounts(itemsTotal, discounts).reduce((a, b) => a + b, 0)
  const paid = payments.filter(p => !p.reversed).reduce((sum, p) => sum + p.amountKobo, 0)
  const reversed = payments.filter(p => p.reversed).reduce((sum, p) => sum + p.amountKobo, 0)
  const billed = itemsTotal + carryForward
  return { itemsTotal, carryForward, discountTotal, billed, paid, reversed, balance: billed - discountTotal - paid }
}

/**
 * What is still owed for each term (Phase 10d), from a child's bills oldest → newest and the newest bill's balance
 * (which carries every earlier term forward). Payments clear the oldest debt first, so what's owed sits on the
 * newest terms: walking back, each term takes up to its own charges (items − discounts, not arrears). Debt left
 * over after the oldest bill (a break in the carry-forward chain) stays on the oldest. Terms owing nothing are absent.
 */
export function owedByTerm(bills: readonly { termId: string, ownChargesKobo: number }[], outstandingKobo: number) {
  const owed = new Map<string, number>()
  let remaining = Math.max(outstandingKobo, 0)
  for (const bill of [...bills].reverse()) {
    const share = Math.min(remaining, Math.max(bill.ownChargesKobo, 0))
    if (share > 0) owed.set(bill.termId, share)
    remaining -= share
  }
  const oldest = bills[0]
  if (remaining > 0 && oldest) owed.set(oldest.termId, (owed.get(oldest.termId) ?? 0) + remaining)
  return owed
}

/** The line that brings the previous term's balance onto a new bill, or null when it was settled exactly. */
export function carryForwardLine(previousBalance: number, termLabel: string) {
  if (previousBalance === 0) return null
  return {
    kind: 'carry_forward' as const,
    description: `${previousBalance > 0 ? 'Arrears' : 'Credit'} brought forward (${termLabel})`,
    amountKobo: previousBalance,
  }
}

export type LedgerBill = {
  term: string
  /** When the bill was raised (YYYY-MM-DD) */
  date: string
  lines: readonly { kind: BillLineKind, description: string, amountKobo: number }[]
  discounts: readonly (DiscountRule & { date: string, reason: string })[]
  payments: readonly { date: string, receiptNumber: string, amountKobo: number, reversal: { date: string, reason: string } | null }[]
}

/**
 * A student's account across terms, oldest first, with a running balance. Carry-forward lines are left
 * out: they only restate the previous bills, which are already in the ledger.
 */
export function ledger(bills: readonly LedgerBill[]) {
  type Entry = { date: string, description: string, debit: number, credit: number }
  const entries: Entry[] = []
  for (const bill of bills) {
    for (const line of bill.lines.filter(l => l.kind === 'item')) {
      entries.push({ date: bill.date, description: `${line.description} (${bill.term})`, debit: line.amountKobo, credit: 0 })
    }
    const itemsTotal = bill.lines.filter(l => l.kind === 'item').reduce((sum, l) => sum + l.amountKobo, 0)
    discountAmounts(itemsTotal, bill.discounts).forEach((amount, i) => {
      if (amount) entries.push({ date: bill.discounts[i]!.date, description: `Discount: ${bill.discounts[i]!.reason}`, debit: 0, credit: amount })
    })
    for (const payment of bill.payments) {
      entries.push({ date: payment.date, description: `Payment ${payment.receiptNumber}`, debit: 0, credit: payment.amountKobo })
      if (payment.reversal) {
        entries.push({ date: payment.reversal.date, description: `Reversal of ${payment.receiptNumber}: ${payment.reversal.reason}`, debit: payment.amountKobo, credit: 0 })
      }
    }
  }
  // Stable sort: same-day entries keep their order (charges, discounts, payments, reversals)
  entries.sort((a, b) => a.date.localeCompare(b.date))
  let balance = 0
  return entries.map((e) => {
    balance += e.debit - e.credit
    return { ...e, balance }
  })
}

/** `RCT/2026/000123`: per school, per year. */
export function formatReceiptNumber(year: number, n: number) {
  return `RCT/${year}/${String(n).padStart(6, '0')}`
}

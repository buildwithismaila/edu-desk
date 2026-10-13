// Money is integer kobo everywhere (₦1 = 100 kobo; docs/architecture.md). Never floats.

/** The largest single fee line or payment: ₦10,000,000 (fits a Postgres integer in kobo). */
export const MAX_AMOUNT_KOBO = 1_000_000_000

/**
 * Naira as typed ("25,000.50", "₦1,500", 85000) → integer kobo, or null if it isn't a valid amount
 * (negative, more than 2 decimals, junk, over the maximum). Parsed as text, so 0.29 is exactly 29 kobo.
 */
export function parseNaira(input: string | number): number | null {
  const text = String(input).replace(/[₦\s]/g, '').replace(/,(?=\d{3}(?:\D|$))/g, '')
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text)
  if (!match) return null
  const kobo = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return kobo <= MAX_AMOUNT_KOBO ? kobo : null
}

const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' })

/** Integer kobo → "₦25,000.50" (negative: "-₦500.00"). */
export function formatNaira(kobo: number) {
  return naira.format(kobo / 100)
}

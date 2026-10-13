import { describe, expect, it } from 'vitest'
import { formatNaira, MAX_AMOUNT_KOBO, parseNaira } from '~~/shared/utils/money'

describe('parseNaira', () => {
  it('turns naira (with commas, ₦ and up to 2 decimals) into integer kobo', () => {
    expect(parseNaira('25000')).toBe(2_500_000)
    expect(parseNaira('25,000.50')).toBe(2_500_050)
    expect(parseNaira(' ₦ 1,500.5 ')).toBe(150_050)
    expect(parseNaira('0.01')).toBe(1)
    expect(parseNaira('0')).toBe(0)
    expect(parseNaira(85000)).toBe(8_500_000)
  })

  it('never uses floating point for the decimals', () => {
    // 0.29 * 100 = 28.999999999999996 in floating point
    expect(parseNaira('0.29')).toBe(29)
    expect(parseNaira('1.10')).toBe(110)
  })

  it('refuses negatives, 3+ decimals, junk and amounts over the maximum', () => {
    for (const input of ['-5', '1.234', 'abc', '', '1,2,3.', '1e5', '₦']) expect(parseNaira(input), input).toBeNull()
    expect(parseNaira('10,000,000')).toBe(MAX_AMOUNT_KOBO)
    expect(parseNaira('10,000,000.01')).toBeNull()
  })
})

describe('formatNaira', () => {
  it('formats kobo as naira', () => {
    expect(formatNaira(2_500_050)).toBe('₦25,000.50')
    expect(formatNaira(0)).toBe('₦0.00')
    expect(formatNaira(-50_000)).toBe('-₦500.00')
  })
})

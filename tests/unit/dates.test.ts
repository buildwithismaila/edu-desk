import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, todayIn } from '~~/shared/utils/dates'

describe('formatDateTime', () => {
  it('formats as DD/MM/YYYY HH:mm in Lagos time (UTC+1)', () => {
    expect(formatDateTime(new Date('2026-10-11T17:05:00Z'))).toBe('11/10/2026 18:05')
  })

  it('rolls over the date at Lagos midnight', () => {
    expect(formatDateTime('2026-12-31T23:30:00Z')).toBe('01/01/2027 00:30')
  })

  it.each([null, undefined])('returns an empty string for %s', (value) => {
    expect(formatDateTime(value)).toBe('')
  })
})

describe('formatDate', () => {
  it('formats a calendar date as DD/MM/YYYY without time-zone shifts', () => {
    expect(formatDate('2027-01-01')).toBe('01/01/2027')
  })

  it.each([null, undefined, ''])('returns an empty string for %j', (value) => {
    expect(formatDate(value)).toBe('')
  })
})

describe('todayIn', () => {
  it('gives the calendar date in Lagos (UTC+1), which is a day ahead late in the UTC evening', () => {
    expect(todayIn('Africa/Lagos', new Date('2026-10-12T22:59:00Z'))).toBe('2026-10-12')
    expect(todayIn('Africa/Lagos', new Date('2026-10-12T23:30:00Z'))).toBe('2026-10-13')
  })

  it('pads month and day', () => {
    expect(todayIn('Africa/Lagos', new Date('2027-01-05T08:00:00Z'))).toBe('2027-01-05')
  })
})

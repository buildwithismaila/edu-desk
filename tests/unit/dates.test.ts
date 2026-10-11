import { describe, expect, it } from 'vitest'
import { formatDateTime } from '~~/shared/utils/dates'

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

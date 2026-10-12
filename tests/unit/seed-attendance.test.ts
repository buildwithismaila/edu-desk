import { describe, expect, it } from 'vitest'
import { schoolDaysBefore } from '~~/server/database/seed/attendance'

const term = { startsOn: '2026-09-14', endsOn: '2026-12-18' }

describe('schoolDaysBefore', () => {
  it('gives the weekdays before today, oldest first, skipping weekends and today', () => {
    // 2026-10-12 is a Monday
    expect(schoolDaysBefore('2026-10-12', 6, term)).toEqual(['2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'])
  })

  it('stays inside the term', () => {
    expect(schoolDaysBefore('2026-09-16', 10, term)).toEqual(['2026-09-14', '2026-09-15'])
    expect(schoolDaysBefore('2027-02-01', 2, term)).toEqual(['2026-12-17', '2026-12-18'])
    expect(schoolDaysBefore('2026-09-01', 5, term)).toEqual([])
  })

  it('has no limit without term dates', () => {
    expect(schoolDaysBefore('2026-10-12', 1, { startsOn: null, endsOn: null })).toEqual(['2026-10-09'])
  })
})

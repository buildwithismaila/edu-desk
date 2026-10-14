import { describe, expect, it } from 'vitest'
import { percentOf, todayAttendance } from '~~/shared/utils/dashboard'

describe('percentOf', () => {
  it('rounds to a whole percent', () => {
    expect(percentOf(1, 3)).toBe(33)
    expect(percentOf(2, 3)).toBe(67)
    expect(percentOf(5, 5)).toBe(100)
    expect(percentOf(0, 4)).toBe(0)
  })

  it('is null when there is nothing to divide by', () => {
    expect(percentOf(0, 0)).toBeNull()
  })
})

describe('todayAttendance', () => {
  const arms = [
    { id: 'a', label: 'JSS 1A' },
    { id: 'b', label: 'JSS 1B' },
    { id: 'c', label: 'Primary 3A' },
  ]

  it('has nothing taken before the first register', () => {
    expect(todayAttendance({ arms, registers: [] })).toEqual({
      taken: 0, total: 3, marked: 0, present: 0, absent: 0, late: 0, rate: null,
      notTaken: arms,
    })
  })

  it('counts late as present, over every mark of the registers taken', () => {
    const result = todayAttendance({
      arms,
      registers: [
        { classArmId: 'a', statuses: ['present', 'present', 'absent', 'late'] },
        { classArmId: 'c', statuses: ['present', 'present'] },
      ],
    })
    // 6 marked, 1 absent → 5 / 6
    expect(result).toEqual({
      taken: 2, total: 3, marked: 6, present: 5, absent: 1, late: 1, rate: 83,
      notTaken: [{ id: 'b', label: 'JSS 1B' }],
    })
  })

  it('ignores registers of arms not in the list (e.g. an arm without students)', () => {
    const result = todayAttendance({ arms: [arms[0]!], registers: [{ classArmId: 'a', statuses: ['present'] }, { classArmId: 'x', statuses: ['absent'] }] })
    expect(result).toMatchObject({ taken: 1, total: 1, marked: 1, rate: 100, notTaken: [] })
  })
})

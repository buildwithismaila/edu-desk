import { describe, expect, it } from 'vitest'
import { registerQuerySchema, saveRegisterSchema, summaryQuerySchema } from '~~/shared/schemas/attendance'
import { registerDateError, summariseAttendance } from '~~/shared/utils/attendance'

const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'

describe('summariseAttendance', () => {
  it('has no rate when nothing is marked', () => {
    expect(summariseAttendance([])).toEqual({ opened: 0, present: 0, absent: 0, late: 0, rate: null })
  })

  it('counts every day present', () => {
    expect(summariseAttendance(['present', 'present', 'present'])).toEqual({ opened: 3, present: 3, absent: 0, late: 0, rate: 100 })
  })

  it('counts late as present, and shows it separately', () => {
    expect(summariseAttendance(['present', 'late', 'absent', 'late'])).toEqual({ opened: 4, present: 3, absent: 1, late: 2, rate: 75 })
  })

  it('rounds the rate to a whole percent', () => {
    expect(summariseAttendance(['present', 'present', 'absent']).rate).toBe(67)
    expect(summariseAttendance(['present', 'absent', 'absent']).rate).toBe(33)
    expect(summariseAttendance(['absent']).rate).toBe(0)
  })
})

describe('registerDateError', () => {
  const today = '2026-10-12'
  const term = { startsOn: '2026-09-14', endsOn: '2026-12-18' }

  it('allows today for everyone', () => {
    expect(registerDateError({ date: today, today, term, canBackfill: false })).toBeNull()
    expect(registerDateError({ date: today, today, term, canBackfill: true })).toBeNull()
  })

  it('refuses any other day for a class teacher', () => {
    expect(registerDateError({ date: '2026-10-09', today, term, canBackfill: false })).toBe('You can only take today\'s register')
  })

  it('refuses future dates for everyone', () => {
    expect(registerDateError({ date: '2026-10-13', today, term, canBackfill: false })).toBe('That date is in the future')
    expect(registerDateError({ date: '2026-10-13', today, term, canBackfill: true })).toBe('That date is in the future')
  })

  it('lets admin and principal back-fill a date in the term', () => {
    expect(registerDateError({ date: '2026-09-14', today, term, canBackfill: true })).toBeNull()
    expect(registerDateError({ date: '2026-10-09', today, term, canBackfill: true })).toBeNull()
  })

  it('refuses dates outside the term', () => {
    expect(registerDateError({ date: '2026-09-11', today, term, canBackfill: true })).toBe('That date is before this term started')
    expect(registerDateError({ date: today, today, term: { startsOn: '2026-10-13', endsOn: null }, canBackfill: false })).toBe('That date is before this term started')
    expect(registerDateError({ date: today, today, term: { startsOn: '2026-09-14', endsOn: '2026-10-09' }, canBackfill: false })).toBe('That date is after this term ended')
  })

  it('has no term limits when the term has no dates', () => {
    expect(registerDateError({ date: '2020-01-06', today, term: { startsOn: null, endsOn: null }, canBackfill: true })).toBeNull()
  })
})

describe('saveRegisterSchema', () => {
  const valid = { classArmId: ID_A, date: '2026-10-12', marks: [{ studentId: ID_A, status: 'present' }, { studentId: ID_B, status: 'late' }] }

  it('accepts a register', () => {
    expect(saveRegisterSchema.parse(valid)).toEqual(valid)
  })

  it('rejects unknown statuses, bad dates and ids', () => {
    expect(saveRegisterSchema.safeParse({ ...valid, marks: [{ studentId: ID_A, status: 'excused' }] }).success).toBe(false)
    expect(saveRegisterSchema.safeParse({ ...valid, date: '12/10/2026' }).success).toBe(false)
    expect(saveRegisterSchema.safeParse({ ...valid, classArmId: 'nope' }).success).toBe(false)
  })

  it('needs at least one mark and refuses a student marked twice', () => {
    expect(saveRegisterSchema.safeParse({ ...valid, marks: [] }).success).toBe(false)
    const twice = saveRegisterSchema.safeParse({ ...valid, marks: [{ studentId: ID_A, status: 'present' }, { studentId: ID_A, status: 'absent' }] })
    expect(twice.success).toBe(false)
    expect(twice.error!.issues[0]!.message).toBe('Each student can only be marked once')
  })
})

describe('query schemas', () => {
  it('make the date and term optional', () => {
    expect(registerQuerySchema.parse({ classArmId: ID_A })).toEqual({ classArmId: ID_A })
    expect(registerQuerySchema.safeParse({ classArmId: ID_A, date: '2026-13-01' }).success).toBe(false)
    expect(summaryQuerySchema.parse({ classArmId: ID_A, termId: ID_B })).toEqual({ classArmId: ID_A, termId: ID_B })
    expect(summaryQuerySchema.safeParse({}).success).toBe(false)
  })
})

describe('registerDateError: registers taken offline (Phase 10c)', () => {
  const today = '2026-10-12'
  const term = { startsOn: '2026-09-14', endsOn: '2026-12-18' }
  const offline = (date: string, extra: Partial<{ canBackfill: boolean, term: { startsOn: string | null, endsOn: string | null } }> = {}) =>
    registerDateError({ date, today, term: extra.term ?? term, canBackfill: extra.canBackfill ?? false, offline: true })

  it('lets a class teacher send a register taken offline up to 3 days late', () => {
    expect(offline('2026-10-12')).toBeNull()
    expect(offline('2026-10-11')).toBeNull()
    expect(offline('2026-10-09')).toBeNull()
  })

  it('refuses one older than 3 days, with a way forward', () => {
    expect(offline('2026-10-08')).toBe('This register is more than 3 days old. Ask an admin to enter it.')
  })

  it('still refuses the future, and days outside the term', () => {
    expect(offline('2026-10-13')).toBe('That date is in the future')
    expect(offline('2026-10-10', { term: { startsOn: '2026-10-11', endsOn: null } })).toBe('That date is before this term started')
  })

  it('leaves online saves as they were', () => {
    expect(registerDateError({ date: '2026-10-11', today, term, canBackfill: false })).toBe('You can only take today\'s register')
    expect(registerDateError({ date: '2026-10-11', today, term, canBackfill: false, offline: false })).toBe('You can only take today\'s register')
  })

  it('crosses month ends correctly', () => {
    const t = { startsOn: '2026-09-14', endsOn: '2026-12-18' }
    expect(registerDateError({ date: '2026-09-30', today: '2026-10-02', term: t, canBackfill: false, offline: true })).toBeNull()
    expect(registerDateError({ date: '2026-09-28', today: '2026-10-02', term: t, canBackfill: false, offline: true })).toBe('This register is more than 3 days old. Ask an admin to enter it.')
  })
})

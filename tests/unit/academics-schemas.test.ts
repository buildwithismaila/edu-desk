import { describe, expect, it } from 'vitest'
import { sessionNameSchema, termDatesSchema } from '~~/shared/schemas/academics'
import { classArmLabel } from '~~/shared/utils/academics'
import { normalisePhone } from '~~/shared/utils/phone'

describe('sessionNameSchema', () => {
  it.each(['2026/2027', ' 1999/2000 '])('accepts %j', (name) => {
    expect(sessionNameSchema.safeParse(name).success).toBe(true)
  })

  it('trims the name', () => {
    expect(sessionNameSchema.parse(' 2026/2027 ')).toBe('2026/2027')
  })

  it.each(['2026/2028', '2026/2026', '26/27', '2026-2027', '2026/27', '', 'abcd/efgh'])('rejects %j', (name) => {
    expect(sessionNameSchema.safeParse(name).success).toBe(false)
  })
})

describe('termDatesSchema', () => {
  const ok = { startsOn: '2026-09-14', endsOn: '2026-12-18', nextTermBeginsOn: '2027-01-11' }

  it('accepts ordered dates', () => {
    expect(termDatesSchema.safeParse(ok).success).toBe(true)
  })

  it('allows any date to be empty', () => {
    expect(termDatesSchema.safeParse({ startsOn: null, endsOn: null, nextTermBeginsOn: null }).success).toBe(true)
    expect(termDatesSchema.safeParse({ startsOn: '2026-09-14' }).success).toBe(true)
  })

  it.each([
    ['end before start', { ...ok, endsOn: '2026-09-01' }, 'endsOn'],
    ['end equal to start', { ...ok, endsOn: '2026-09-14' }, 'endsOn'],
    ['next term before the end', { ...ok, nextTermBeginsOn: '2026-12-01' }, 'nextTermBeginsOn'],
    ['an invalid date', { ...ok, startsOn: '2026-02-30' }, 'startsOn'],
    ['a non-ISO date', { ...ok, startsOn: '14/09/2026' }, 'startsOn'],
  ])('rejects %s', (_case, input, field) => {
    const result = termDatesSchema.safeParse(input)
    expect(result.success).toBe(false)
    expect(result.error?.issues.map(i => i.path[0])).toContain(field)
  })
})

describe('classArmLabel', () => {
  it.each([
    ['JSS 1', 'A', 'JSS 1A'],
    ['Primary 3', 'B', 'Primary 3B'],
    ['JSS 1', 'Gold', 'JSS 1 Gold'],
    ['Nursery 2', '1', 'Nursery 2 1'],
    ['SSS 1', 'a', 'SSS 1a'],
  ])('%s + %s → %s', (level, arm, label) => {
    expect(classArmLabel(level, arm)).toBe(label)
  })
})

describe('normalisePhone', () => {
  it.each([
    ['08031234567', '+2348031234567'],
    ['0803 123 4567', '+2348031234567'],
    ['0803-123-4567', '+2348031234567'],
    ['+2348031234567', '+2348031234567'],
    ['+234 803 123 4567', '+2348031234567'],
    ['2348031234567', '+2348031234567'],
  ])('%s → %s', (input, expected) => {
    expect(normalisePhone(input)).toBe(expected)
  })

  it.each(['0803123456', '080312345678', '+23480312345', '+2338031234567', '12345678901', 'phone', ''])('rejects %j', (input) => {
    expect(normalisePhone(input)).toBeNull()
  })
})

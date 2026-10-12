import { describe, expect, it } from 'vitest'
import { admissionPrefixSchema, defaultAdmissionPrefix, formatAdmissionNumber } from '~~/shared/utils/admission-number'

describe('formatAdmissionNumber', () => {
  it.each([
    [1, 'GFA/2026/0001'],
    [42, 'GFA/2026/0042'],
    [9999, 'GFA/2026/9999'],
    [10000, 'GFA/2026/10000'],
  ])('sequence %i → %s', (seq, expected) => {
    expect(formatAdmissionNumber('GFA', 2026, seq)).toBe(expected)
  })
})

describe('defaultAdmissionPrefix', () => {
  it.each([
    ['Greenfield Academy', 'GA'],
    ['Sunrise Schools', 'SS'],
    ['St. Mary\'s Model College Ikeja Lagos', 'SMMC'],
    ['Sunrise', 'SUN'],
    ['  bright   future  ', 'BF'],
    // Words without letters are ignored, leaving one word
    ['123 Academy', 'ACA'],
    ['!!!', 'SCH'],
    ['', 'SCH'],
  ])('%j → %s', (name, expected) => {
    expect(defaultAdmissionPrefix(name)).toBe(expected)
  })
})

describe('admissionPrefixSchema', () => {
  it('uppercases and trims', () => {
    expect(admissionPrefixSchema.parse(' gfa ')).toBe('GFA')
  })

  it.each(['G', 'TOOLONGX', 'G-A', 'G A', ''])('rejects %j', (value) => {
    expect(admissionPrefixSchema.safeParse(value).success).toBe(false)
  })

  it.each(['GA', 'GFA2', 'SCHOOL'])('accepts %j', (value) => {
    expect(admissionPrefixSchema.safeParse(value).success).toBe(true)
  })
})

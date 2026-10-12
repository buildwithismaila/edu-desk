import { describe, expect, it } from 'vitest'
import { NIGERIAN_STATES, normaliseState } from '~~/shared/constants/states'

describe('NIGERIAN_STATES', () => {
  it('has the 36 states and the FCT, unique and alphabetical', () => {
    expect(NIGERIAN_STATES).toHaveLength(37)
    expect(new Set(NIGERIAN_STATES).size).toBe(37)
    expect([...NIGERIAN_STATES]).toEqual([...NIGERIAN_STATES].sort((a, b) => a.localeCompare(b)))
    expect(NIGERIAN_STATES).toContain('FCT')
    expect(NIGERIAN_STATES).toContain('Akwa Ibom')
  })
})

describe('normaliseState', () => {
  it.each([
    ['Lagos', 'Lagos'],
    [' lagos ', 'Lagos'],
    ['AKWA IBOM', 'Akwa Ibom'],
    ['Akwa-Ibom', 'Akwa Ibom'],
    ['cross river', 'Cross River'],
    ['FCT', 'FCT'],
    ['Abuja', 'FCT'],
    ['Federal Capital Territory', 'FCT'],
  ])('%j → %s', (input, expected) => {
    expect(normaliseState(input)).toBe(expected)
  })

  it.each(['Lagoss', 'Accra', '', 'Abuja Municipal'])('rejects %j', (input) => {
    expect(normaliseState(input)).toBeNull()
  })
})

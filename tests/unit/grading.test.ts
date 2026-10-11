import { describe, expect, it } from 'vitest'
import { type GradeBand, validateGradeBands } from '~~/shared/utils/grading'

const band = (grade: string, minScore: number, maxScore: number): GradeBand => ({ grade, minScore, maxScore, remark: '' })

const WAEC: GradeBand[] = [
  band('A1', 75, 100), band('B2', 70, 74), band('B3', 65, 69), band('C4', 60, 64), band('C5', 55, 59),
  band('C6', 50, 54), band('D7', 45, 49), band('E8', 40, 44), band('F9', 0, 39),
]
const PRIMARY: GradeBand[] = [band('A', 70, 100), band('B', 60, 69), band('C', 50, 59), band('D', 45, 49), band('E', 40, 44), band('F', 0, 39)]

describe('validateGradeBands', () => {
  it.each([['WAEC (SSS)', WAEC], ['Primary & JSS', PRIMARY]])('accepts the %s default scale', (_name, bands) => {
    expect(validateGradeBands(bands)).toEqual([])
  })

  it('accepts a single band covering 0–100', () => {
    expect(validateGradeBands([band('P', 0, 100)])).toEqual([])
  })

  it('accepts bands in any order', () => {
    expect(validateGradeBands([...PRIMARY].reverse())).toEqual([])
  })

  it('reports a gap between bands', () => {
    const bands = PRIMARY.map(b => b.grade === 'E' ? band('E', 41, 44) : b) // 40 is uncovered
    expect(validateGradeBands(bands)).toEqual(['Gap between 39 and 41: score 40 has no grade'])
  })

  it('reports overlapping bands', () => {
    const bands = WAEC.map(b => b.grade === 'C5' ? band('C5', 55, 60) : b) // 60 is in C4 and C5
    expect(validateGradeBands(bands)).toEqual(['C5 (55–60) overlaps C4 (60–64)'])
  })

  it('requires the lowest band to start at 0', () => {
    const bands = PRIMARY.map(b => b.grade === 'F' ? band('F', 1, 39) : b)
    expect(validateGradeBands(bands)).toEqual(['The lowest band must start at 0'])
  })

  it('requires the highest band to end at 100', () => {
    const bands = PRIMARY.map(b => b.grade === 'A' ? band('A', 70, 99) : b)
    expect(validateGradeBands(bands)).toEqual(['The highest band must end at 100'])
  })

  it('reports a band whose minimum is above its maximum', () => {
    expect(validateGradeBands([band('A', 50, 100), band('F', 49, 0)])).toContain('F: the minimum (49) is above the maximum (0)')
  })

  it('reports a duplicate grade', () => {
    expect(validateGradeBands([band('A', 50, 100), band('A', 0, 49)])).toContain('Grade A is used more than once')
  })

  it.each([
    ['an empty grade', [band('', 0, 100)], 'Every band needs a grade'],
    ['a non-integer score', [band('A', 0, 99.5), band('B', 100, 100)], 'Scores must be whole numbers from 0 to 100'],
    ['a score above 100', [band('A', 0, 101)], 'Scores must be whole numbers from 0 to 100'],
    ['a negative score', [band('A', -1, 100)], 'Scores must be whole numbers from 0 to 100'],
  ])('reports %s', (_case, bands, message) => {
    expect(validateGradeBands(bands)).toContain(message)
  })

  it('requires at least one band', () => {
    expect(validateGradeBands([])).toEqual(['Add at least one band'])
  })

  it.each([[39, 'F9'], [40, 'E8'], [74, 'B2'], [75, 'A1'], [100, 'A1'], [0, 'F9']])(
    'the default WAEC scale places score %i in exactly one band (%s)',
    (score, grade) => {
      const matches = WAEC.filter(b => score >= b.minScore && score <= b.maxScore)
      expect(matches.map(b => b.grade)).toEqual([grade])
    },
  )
})

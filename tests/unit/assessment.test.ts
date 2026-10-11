import { describe, expect, it } from 'vitest'
import { validateAssessmentComponents } from '~~/shared/utils/assessment'

const c = (name: string, maxScore: number) => ({ name, maxScore })

describe('validateAssessmentComponents', () => {
  it('accepts the default CA1 20, CA2 20, Exam 60', () => {
    expect(validateAssessmentComponents([c('CA1', 20), c('CA2', 20), c('Exam', 60)])).toEqual([])
  })

  it('accepts a four-component split that sums to 100', () => {
    expect(validateAssessmentComponents([c('CA1', 10), c('CA2', 10), c('Project', 20), c('Exam', 60)])).toEqual([])
  })

  it('accepts a single 100-mark exam', () => {
    expect(validateAssessmentComponents([c('Exam', 100)])).toEqual([])
  })

  it.each([
    [99, 'Total is 99; it must be 100'],
    [101, 'Total is 101; it must be 100'],
  ])('rejects a total of %i', (examMax, message) => {
    expect(validateAssessmentComponents([c('CA1', 20), c('CA2', 20), c('Exam', examMax - 40)])).toEqual([message])
  })

  it('requires at least one component', () => {
    expect(validateAssessmentComponents([])).toEqual(['Add at least one component'])
  })

  it('allows at most five components', () => {
    const six = Array.from({ length: 6 }, (_, i) => c(`C${i}`, i === 0 ? 50 : 10))
    expect(validateAssessmentComponents(six)).toContain('Use at most 5 components')
  })

  it('rejects duplicate names, ignoring case and spaces', () => {
    expect(validateAssessmentComponents([c('CA', 40), c(' ca ', 60)])).toContain('Each component needs a different name')
  })

  it('rejects an empty name', () => {
    expect(validateAssessmentComponents([c('  ', 40), c('Exam', 60)])).toContain('Every component needs a name')
  })

  it.each([
    ['zero', 0],
    ['a fraction', 12.5],
    ['over 100', 101],
  ])('rejects a maximum that is %s', (_case, max) => {
    expect(validateAssessmentComponents([c('CA', max), c('Exam', 100 - max)])).toContain('Each maximum must be a whole number from 1 to 100')
  })
})

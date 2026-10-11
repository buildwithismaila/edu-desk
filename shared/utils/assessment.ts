export interface AssessmentComponentInput {
  name: string
  maxScore: number
}

export const MAX_ASSESSMENT_COMPONENTS = 5

/** Problems with an assessment split (docs/domain.md: maxima must sum to 100). Empty array = valid. */
export function validateAssessmentComponents(components: AssessmentComponentInput[]): string[] {
  if (components.length === 0) return ['Add at least one component']

  const errors: string[] = []
  if (components.length > MAX_ASSESSMENT_COMPONENTS) errors.push(`Use at most ${MAX_ASSESSMENT_COMPONENTS} components`)

  const names = components.map(c => c.name.trim().toLowerCase())
  if (names.some(n => !n)) errors.push('Every component needs a name')
  else if (new Set(names).size !== names.length) errors.push('Each component needs a different name')

  if (components.some(c => !Number.isInteger(c.maxScore) || c.maxScore < 1 || c.maxScore > 100)) {
    errors.push('Each maximum must be a whole number from 1 to 100')
  }
  if (errors.length) return errors

  const total = components.reduce((sum, c) => sum + c.maxScore, 0)
  if (total !== 100) errors.push(`Total is ${total}; it must be 100`)
  return errors
}

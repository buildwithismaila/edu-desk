export interface GradeBand {
  grade: string
  minScore: number
  maxScore: number
  remark: string
}

const isScore = (n: number) => Number.isInteger(n) && n >= 0 && n <= 100
const range = (b: GradeBand) => `${b.grade} (${b.minScore}–${b.maxScore})`

/**
 * Problems with a grading scale (docs/domain.md): bands must be contiguous, non-overlapping and
 * cover 0–100 exactly, with whole-number bounds and unique grades. Empty array = valid.
 */
export function validateGradeBands(bands: GradeBand[]): string[] {
  if (bands.length === 0) return ['Add at least one band']

  const errors: string[] = []
  if (bands.some(b => !b.grade.trim())) errors.push('Every band needs a grade')
  if (bands.some(b => !isScore(b.minScore) || !isScore(b.maxScore))) errors.push('Scores must be whole numbers from 0 to 100')

  const seen = new Set<string>()
  for (const b of bands) {
    const key = b.grade.trim().toUpperCase()
    if (key && seen.has(key)) errors.push(`Grade ${b.grade.trim()} is used more than once`)
    seen.add(key)
    if (b.minScore > b.maxScore) errors.push(`${b.grade}: the minimum (${b.minScore}) is above the maximum (${b.maxScore})`)
  }
  if (errors.length) return errors

  const sorted = [...bands].sort((a, b) => a.minScore - b.minScore)
  if (sorted[0]!.minScore !== 0) errors.push('The lowest band must start at 0')
  if (sorted.at(-1)!.maxScore !== 100) errors.push('The highest band must end at 100')

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const next = sorted[i]!
    if (next.minScore <= prev.maxScore) {
      errors.push(`${range(prev)} overlaps ${range(next)}`)
    }
    else if (next.minScore > prev.maxScore + 1) {
      const first = prev.maxScore + 1
      const last = next.minScore - 1
      const missing = first === last ? `score ${first} has no grade` : `scores ${first}–${last} have no grade`
      errors.push(`Gap between ${prev.maxScore} and ${next.minScore}: ${missing}`)
    }
  }
  return errors
}

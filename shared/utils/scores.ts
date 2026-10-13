// Score entry rules (docs/domain.md → Assessment). Shared so the grid and the API agree.

export type ScoreCell = { score: number | null, absent: boolean }

/**
 * One grid cell as typed: blank = not entered, `ABS`/`a` = absent (≠ 0), else a whole number 0…max.
 */
export function parseScoreCell(input: string, max: number): { ok: true, value: ScoreCell } | { ok: false, message: string } {
  const value = input.trim()
  if (!value) return { ok: true, value: { score: null, absent: false } }
  if (/^(?:abs|a)$/i.test(value)) return { ok: true, value: { score: null, absent: true } }
  if (/^-?\d+$/.test(value)) {
    const score = Number(value)
    if (score < 0 || score > max) return { ok: false, message: `Enter a score from 0 to ${max}` }
    return { ok: true, value: { score, absent: false } }
  }
  if (/^-?\d*\.\d+$/.test(value)) return { ok: false, message: 'Use whole numbers' }
  return { ok: false, message: 'Enter a number, or ABS for absent' }
}

/** A student's subject total: null while nothing is entered; absent counts as 0. */
export function sheetTotal(cells: readonly (ScoreCell | null | undefined)[]): number | null {
  const entered = cells.filter((c): c is ScoreCell => !!c && (c.absent || c.score !== null))
  if (!entered.length) return null
  return entered.reduce((sum, c) => sum + (c.score ?? 0), 0)
}

/** Grade and remark from the section's bands, or null without a total (or a scale). */
export function gradeFor(total: number | null, bands: readonly { grade: string, minScore: number, maxScore: number, remark: string }[]) {
  if (total === null) return null
  const band = bands.find(b => total >= b.minScore && total <= b.maxScore)
  return band ? { grade: band.grade, remark: band.remark } : null
}

/** Core subjects (no department) for everyone; a department subject only for students in that department. */
export function studentOffersSubject(student: { departmentId: string | null }, subject: { departmentId: string | null }) {
  return subject.departmentId === null || student.departmentId === subject.departmentId
}

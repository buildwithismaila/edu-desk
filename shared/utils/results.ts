// Result computation (docs/domain.md → Result computation). Pure, so the API, report cards and tests agree.
import type { Role } from '../constants/roles'
import { gradeFor, type ScoreCell, sheetTotal } from './scores'

type Band = { grade: string, minScore: number, maxScore: number, remark: string }
type Component = { id: string, name: string, maxScore: number }
type Subject = { id: string, name: string }

/** An exact average (overall total ÷ subjects offered), so ties can be compared without float error. */
export type ExactAverage = { total: number, count: number }

/** `a ÷ b` rounded to 2 dp, for display only. */
export function roundTo2(a: number, b: number) {
  return Math.round((a * 100) / b) / 100
}

/**
 * Competition ranking ("1, 2, 3, 3, 5"): `compare` sorts best first (negative when `a` ranks above `b`).
 * Returns each item's position, in the input order.
 */
export function competitionRanking<T>(items: readonly T[], compare: (a: T, b: T) => number): number[] {
  return items.map(item => 1 + items.filter(other => compare(other, item) < 0).length)
}

/** Higher average first, compared exactly by cross-multiplying. */
const byAverage = (a: ExactAverage, b: ExactAverage) => b.total * a.count - a.total * b.count

export interface ArmResultsInput {
  components: readonly Component[]
  subjects: readonly Subject[]
  students: readonly { id: string }[]
  /** `${studentId}:${subjectId}:${componentId}` → the entered cell (absent from the map = not entered) */
  cells: Readonly<Record<string, ScoreCell>>
  bands: readonly Band[]
}

/**
 * Per student: offered subjects (≥ 1 entered cell) with totals (ABS = 0), grades and subject positions;
 * overall total, average over offered subjects, and class position (competition ranking by exact average;
 * students with no scores aren't ranked). Plus per-subject class stats.
 */
export function computeArmResults({ components, subjects, students, cells, bands }: ArmResultsInput) {
  const rows = students.map((student) => {
    const subjectRows = subjects.flatMap((subject) => {
      const subjectCells = Object.fromEntries(components.map(c => [c.id, cells[`${student.id}:${subject.id}:${c.id}`] ?? null]))
      const total = sheetTotal(Object.values(subjectCells))
      if (total === null) return []
      const grade = gradeFor(total, bands)
      return [{ subjectId: subject.id, cells: subjectCells, total, grade: grade?.grade ?? null, remark: grade?.remark ?? null, position: 0 }]
    })
    const total = subjectRows.length ? subjectRows.reduce((sum, r) => sum + r.total, 0) : null
    const exact = total === null ? null : { total, count: subjectRows.length }
    return {
      studentId: student.id,
      subjects: subjectRows,
      total,
      offered: subjectRows.length,
      exact,
      average: exact ? roundTo2(exact.total, exact.count) : null,
      position: null as number | null,
    }
  })

  const ranked = rows.filter(r => r.exact)
  competitionRanking(ranked.map(r => r.exact!), byAverage).forEach((position, i) => {
    ranked[i]!.position = position
  })

  const subjectStats = subjects.flatMap((subject) => {
    const taken = rows.flatMap(r => r.subjects.filter(s => s.subjectId === subject.id))
    if (!taken.length) return []
    competitionRanking(taken.map(t => t.total), (a, b) => b - a).forEach((position, i) => {
      taken[i]!.position = position
    })
    const totals = taken.map(t => t.total)
    return [{
      subjectId: subject.id,
      students: taken.length,
      average: roundTo2(totals.reduce((a, b) => a + b, 0), totals.length),
      highest: Math.max(...totals),
      lowest: Math.min(...totals),
    }]
  })

  return { students: rows, subjectStats, ranked: ranked.length }
}

/** Third term: the mean of the term averages the student has in the session (2 dp), or null. */
export function cumulativeAverage(termAverages: readonly (ExactAverage | null)[]) {
  const averages = termAverages.filter((a): a is ExactAverage => a !== null).map(a => a.total / a.count)
  if (!averages.length) return null
  return Math.round((averages.reduce((a, b) => a + b, 0) / averages.length) * 100) / 100
}

/**
 * What's missing before results can be submitted: per subject sheet, each student's missing components
 * (or "Rating" for Nursery, which has no components). Complete subjects are left out.
 */
export function resultsCompleteness({ components, sheets, has }: {
  components: readonly { id: string, name: string }[]
  sheets: readonly { subject: Subject, students: readonly { id: string, name: string }[] }[]
  has: (studentId: string, subjectId: string, componentId?: string) => boolean
}) {
  return sheets.flatMap(({ subject, students }) => {
    const missing = students.flatMap((student) => {
      const gaps = components.length
        ? components.filter(c => !has(student.id, subject.id, c.id)).map(c => c.name)
        : has(student.id, subject.id) ? [] : ['Rating']
      return gaps.length ? [{ studentId: student.id, name: student.name, components: gaps }] : []
    })
    return missing.length ? [{ subjectId: subject.id, subjectName: subject.name, missing }] : []
  })
}

export const RESULT_STATUSES = ['draft', 'submitted', 'published'] as const
export type ResultStatus = typeof RESULT_STATUSES[number]
export type ResultAction = 'submit' | 'publish' | 'return' | 'unpublish'

const MOVES: Record<ResultAction, { from: ResultStatus, to: ResultStatus, wrongStatus: string, forbidden: string }> = {
  submit: { from: 'draft', to: 'submitted', wrongStatus: '', forbidden: 'Only the class teacher, the principal or an admin can submit results' },
  publish: { from: 'submitted', to: 'published', wrongStatus: 'Only submitted results can be published', forbidden: 'Only the principal or an admin can publish results' },
  return: { from: 'submitted', to: 'draft', wrongStatus: 'Only submitted results can be returned to draft', forbidden: 'Only the principal or an admin can return results to draft' },
  unpublish: { from: 'published', to: 'submitted', wrongStatus: 'Only published results can be unpublished', forbidden: 'Only the principal or an admin can unpublish results' },
}

/**
 * Draft → Submitted (class teacher, admin, principal) → Published (admin, principal); Return (submitted →
 * draft) and Unpublish (published → submitted) are admin/principal. Role is checked before status.
 */
export function transitionResults(status: ResultStatus, action: ResultAction, actor: { role: Role, isClassTeacher: boolean }): { ok: true, to: ResultStatus } | { ok: false, reason: 'forbidden' | 'conflict', message: string } {
  const move = MOVES[action]
  const lead = actor.role === 'admin' || actor.role === 'principal'
  const allowed = action === 'submit' ? lead || (actor.role === 'teacher' && actor.isClassTeacher) : lead
  if (!allowed) return { ok: false, reason: 'forbidden', message: move.forbidden }
  if (status !== move.from) {
    const message = action === 'submit' ? `These results are already ${status}` : move.wrongStatus
    return { ok: false, reason: 'conflict', message }
  }
  return { ok: true, to: move.to }
}

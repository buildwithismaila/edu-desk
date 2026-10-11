// School structure and defaults from docs/domain.md. Defaults are applied to every new school by
// server/services/school-defaults.ts; schools can change them afterwards.

export const SECTIONS = ['nursery', 'primary', 'jss', 'sss'] as const
export type Section = typeof SECTIONS[number]

export const SECTION_LABELS: Record<Section, string> = {
  nursery: 'Nursery',
  primary: 'Primary',
  jss: 'Junior Secondary (JSS)',
  sss: 'Senior Secondary (SSS)',
}

/** Sections with a numeric grading scale; Nursery uses skill ratings (Phase 7). */
export const GRADED_SECTIONS = ['primary', 'jss', 'sss'] as const satisfies readonly Section[]
export type GradedSection = typeof GRADED_SECTIONS[number]

export const TERM_NUMBERS = ['first', 'second', 'third'] as const
export type TermNumber = typeof TERM_NUMBERS[number]

export const TERM_LABELS: Record<TermNumber, string> = {
  first: 'First Term',
  second: 'Second Term',
  third: 'Third Term',
}

export const DEFAULT_CLASS_LEVELS: { section: Section, names: string[] }[] = [
  { section: 'nursery', names: ['Creche', 'Pre-Nursery', 'Nursery 1', 'Nursery 2'] },
  { section: 'primary', names: ['Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6'] },
  { section: 'jss', names: ['JSS 1', 'JSS 2', 'JSS 3'] },
  { section: 'sss', names: ['SSS 1', 'SSS 2', 'SSS 3'] },
]

export const DEFAULT_DEPARTMENTS = ['Science', 'Arts', 'Commercial']

export const DEFAULT_ASSESSMENT_COMPONENTS = [
  { name: 'CA1', maxScore: 20 },
  { name: 'CA2', maxScore: 20 },
  { name: 'Exam', maxScore: 60 },
]

const band = (grade: string, minScore: number, maxScore: number, remark: string) => ({ grade, minScore, maxScore, remark })

const PRIMARY_JSS_BANDS = [
  band('A', 70, 100, 'Excellent'),
  band('B', 60, 69, 'Very Good'),
  band('C', 50, 59, 'Good'),
  band('D', 45, 49, 'Fair'),
  band('E', 40, 44, 'Poor'),
  band('F', 0, 39, 'Fail'),
]

export const DEFAULT_GRADE_BANDS: Record<GradedSection, ReturnType<typeof band>[]> = {
  primary: PRIMARY_JSS_BANDS,
  jss: PRIMARY_JSS_BANDS,
  // WAEC style
  sss: [
    band('A1', 75, 100, 'Excellent'),
    band('B2', 70, 74, 'Very Good'),
    band('B3', 65, 69, 'Good'),
    band('C4', 60, 64, 'Credit'),
    band('C5', 55, 59, 'Credit'),
    band('C6', 50, 54, 'Credit'),
    band('D7', 45, 49, 'Pass'),
    band('E8', 40, 44, 'Pass'),
    band('F9', 0, 39, 'Fail'),
  ],
}

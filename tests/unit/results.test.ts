import { describe, expect, it } from 'vitest'
import { DEFAULT_GRADE_BANDS } from '~~/shared/constants/academics'
import {
  competitionRanking,
  computeArmResults,
  cumulativeAverage,
  resultsCompleteness,
  roundTo2,
  transitionResults,
} from '~~/shared/utils/results'

const components = [
  { id: 'ca1', name: 'CA1', maxScore: 20 },
  { id: 'ca2', name: 'CA2', maxScore: 20 },
  { id: 'exam', name: 'Exam', maxScore: 60 },
]
const subjects = [
  { id: 'maths', name: 'Mathematics' },
  { id: 'eng', name: 'English Language' },
  { id: 'bsc', name: 'Basic Science' },
]
const jss = DEFAULT_GRADE_BANDS.jss

type Cell = { score: number | null, absent: boolean }
const s = (score: number): Cell => ({ score, absent: false })
const ABS: Cell = { score: null, absent: true }

/** cells for a student and subject: [CA1, CA2, Exam]; undefined = not entered */
function sheet(entries: Record<string, Record<string, (Cell | undefined)[]>>) {
  const cells: Record<string, Cell> = {}
  for (const [student, bySubject] of Object.entries(entries)) {
    for (const [subject, values] of Object.entries(bySubject)) {
      values.forEach((value, i) => {
        if (value) cells[`${student}:${subject}:${components[i]!.id}`] = value
      })
    }
  }
  return cells
}

describe('competitionRanking', () => {
  const byValueDesc = (a: number, b: number) => b - a

  it('gives tied values the same position and skips the next (1, 2, 3, 3, 5)', () => {
    expect(competitionRanking([90, 80, 70, 70, 60], byValueDesc)).toEqual([1, 2, 3, 3, 5])
    expect(competitionRanking([70, 90, 70, 60, 80], byValueDesc)).toEqual([3, 1, 3, 5, 2])
  })

  it('handles everyone tied, one value, and none', () => {
    expect(competitionRanking([50, 50, 50], byValueDesc)).toEqual([1, 1, 1])
    expect(competitionRanking([42], byValueDesc)).toEqual([1])
    expect(competitionRanking([], byValueDesc)).toEqual([])
  })
})

describe('roundTo2', () => {
  it('rounds for display only', () => {
    expect(roundTo2(200, 3)).toBe(66.67)
    expect(roundTo2(150, 2)).toBe(75)
    expect(roundTo2(1, 3)).toBe(0.33)
  })
})

describe('computeArmResults', () => {
  // Hand-calculated:
  //   Ada:   Maths 15+12+50=77, Eng 10+10+40=60, BSc 18+17+45=80 → 217 / 3 = 72.33 → 1st
  //   Bola:  Maths 10+ABS+30=40, Eng 12+8+30=50, BSc not offered → 90 / 2 = 45.00 → 3rd (tie)
  //   Chidi: Maths 20+20+50=90 only                                → 90 / 1 = 90.00 → 1st (Ada 2nd)
  //   Dayo:  Maths 5+5+20=30, Eng 10+10+40=60                       → 90 / 2 = 45.00 → tied 3rd with Bola
  //   Eze:   nothing at all → not ranked
  const students = ['ada', 'bola', 'chidi', 'dayo', 'eze'].map(id => ({ id }))
  const cells = sheet({
    ada: { maths: [s(15), s(12), s(50)], eng: [s(10), s(10), s(40)], bsc: [s(18), s(17), s(45)] },
    bola: { maths: [s(10), ABS, s(30)], eng: [s(12), s(8), s(30)] },
    chidi: { maths: [s(20), s(20), s(50)] },
    dayo: { maths: [s(5), s(5), s(20)], eng: [s(10), s(10), s(40)] },
  })
  const results = computeArmResults({ components, subjects, students, cells, bands: jss })
  const of = (id: string) => results.students.find(r => r.studentId === id)!

  it('totals each subject (ABS = 0), grades it, and lists only offered subjects', () => {
    expect(of('ada').subjects.map(r => [r.subjectId, r.total, r.grade, r.remark])).toEqual([
      ['maths', 77, 'A', 'Excellent'],
      ['eng', 60, 'B', 'Very Good'],
      ['bsc', 80, 'A', 'Excellent'],
    ])
    expect(of('bola').subjects.map(r => [r.subjectId, r.total])).toEqual([['maths', 40], ['eng', 50]])
    expect(of('bola').subjects[0]!.cells).toEqual({ ca1: s(10), ca2: ABS, exam: s(30) })
  })

  it('averages over offered subjects (2 dp for display) and keeps the exact fraction', () => {
    expect(of('ada')).toMatchObject({ total: 217, offered: 3, average: 72.33, exact: { total: 217, count: 3 } })
    expect(of('bola')).toMatchObject({ total: 90, offered: 2, average: 45 })
    expect(of('chidi')).toMatchObject({ total: 90, offered: 1, average: 90 })
  })

  it('ranks by average with competition ranking; students without scores aren\'t ranked', () => {
    expect(students.map(({ id }) => of(id).position)).toEqual([2, 3, 1, 3, null])
    expect(of('eze')).toMatchObject({ subjects: [], total: null, offered: 0, average: null, position: null })
    expect(results.ranked).toBe(4)
  })

  it('gives per-subject positions and class stats among students who took the subject', () => {
    // Maths totals: Ada 77, Bola 40, Chidi 90, Dayo 30 → 2, 3, 1, 4
    expect(['ada', 'bola', 'chidi', 'dayo'].map(id => of(id).subjects.find(r => r.subjectId === 'maths')!.position)).toEqual([2, 3, 1, 4])
    // English totals: Ada 60, Bola 50, Dayo 60 → 1, 3, 1
    expect(['ada', 'bola', 'dayo'].map(id => of(id).subjects.find(r => r.subjectId === 'eng')!.position)).toEqual([1, 3, 1])
    expect(results.subjectStats).toEqual([
      { subjectId: 'maths', students: 4, average: 59.25, highest: 90, lowest: 30 },
      { subjectId: 'eng', students: 3, average: 56.67, highest: 60, lowest: 50 },
      { subjectId: 'bsc', students: 1, average: 80, highest: 80, lowest: 80 },
    ])
  })

  it('counts a subject with only ABS as offered (total 0)', () => {
    const r = computeArmResults({ components, subjects, students: [{ id: 'x' }], cells: sheet({ x: { maths: [ABS, ABS, ABS], eng: [s(20), s(20), s(60)] } }), bands: jss })
    expect(r.students[0]).toMatchObject({ total: 100, offered: 2, average: 50 })
    expect(r.students[0]!.subjects[0]).toMatchObject({ total: 0, grade: 'F' })
  })

  it('compares averages exactly, so equal fractions tie even where floats differ', () => {
    // 1/3 + 1/3 + 1/3 style: 200/3 vs 400/6 are equal; 0.1 + 0.2 style float noise must not split them
    const many = ['a', 'b'].map(id => ({ id }))
    const r = computeArmResults({
      components: [{ id: 'exam', name: 'Exam', maxScore: 100 }],
      subjects: [1, 2, 3, 4, 5, 6].map(n => ({ id: `s${n}`, name: `S${n}` })),
      students: many,
      cells: {
        'a:s1:exam': s(67), 'a:s2:exam': s(67), 'a:s3:exam': s(66),
        'b:s1:exam': s(67), 'b:s2:exam': s(67), 'b:s3:exam': s(66), 'b:s4:exam': s(67), 'b:s5:exam': s(67), 'b:s6:exam': s(66),
      },
      bands: jss,
    })
    expect(r.students.map(x => x.position)).toEqual([1, 1])
  })

  it('grades at the band boundaries', () => {
    const boundary = (total: number, bands = jss) => computeArmResults({
      components: [{ id: 'exam', name: 'Exam', maxScore: 100 }], subjects: [{ id: 'm', name: 'M' }], students: [{ id: 'x' }],
      cells: { 'x:m:exam': s(total) }, bands,
    }).students[0]!.subjects[0]!.grade
    expect([39, 40, 44, 45, 49, 50, 69, 70, 100].map(t => boundary(t))).toEqual(['F', 'E', 'E', 'D', 'D', 'C', 'B', 'A', 'A'])
    const sss = DEFAULT_GRADE_BANDS.sss
    expect([39, 40, 44, 45, 49, 50, 74, 75, 100].map(t => boundary(t, sss))).toEqual(['F9', 'E8', 'E8', 'D7', 'D7', 'C6', 'B2', 'A1', 'A1'])
  })

  it('handles an arm with no students or no scores', () => {
    expect(computeArmResults({ components, subjects, students: [], cells: {}, bands: jss })).toEqual({ students: [], subjectStats: [], ranked: 0 })
    const none = computeArmResults({ components, subjects, students: [{ id: 'x' }], cells: {}, bands: jss })
    expect(none.ranked).toBe(0)
    expect(none.subjectStats).toEqual([])
  })
})

describe('cumulativeAverage', () => {
  it('is the mean of the term averages the student has (2 dp)', () => {
    // (72.333… + 70 + 70) / 3 = 70.777…
    expect(cumulativeAverage([{ total: 217, count: 3 }, { total: 140, count: 2 }, { total: 210, count: 3 }])).toBe(70.78)
    expect(cumulativeAverage([null, { total: 150, count: 2 }, { total: 120, count: 2 }])).toBe(67.5)
    expect(cumulativeAverage([null, null, { total: 60, count: 1 }])).toBe(60)
    expect(cumulativeAverage([null, null, null])).toBeNull()
  })
})

describe('resultsCompleteness', () => {
  const people = [{ id: 'ada', name: 'Ada Obi' }, { id: 'bola', name: 'Bola Ade' }]
  const entered = new Set(['ada:maths:ca1', 'ada:maths:ca2', 'ada:maths:exam', 'bola:maths:ca1', 'ada:eng:ca1', 'ada:eng:ca2', 'ada:eng:exam', 'bola:eng:ca1', 'bola:eng:ca2', 'bola:eng:exam'])
  const has = (student: string, subject: string, component?: string) => entered.has(`${student}:${subject}:${component}`)

  it('names each student\'s missing components per subject, skipping complete subjects', () => {
    expect(resultsCompleteness({ components, sheets: [{ subject: subjects[0]!, students: people }, { subject: subjects[1]!, students: people }], has })).toEqual([
      { subjectId: 'maths', subjectName: 'Mathematics', missing: [{ studentId: 'bola', name: 'Bola Ade', components: ['CA2', 'Exam'] }] },
    ])
  })

  it('checks Nursery ratings when there are no components', () => {
    const rated = (student: string, subject: string) => student === 'ada' && subject === 'numeracy'
    expect(resultsCompleteness({ components: [], sheets: [{ subject: { id: 'numeracy', name: 'Numeracy' }, students: people }], has: rated })).toEqual([
      { subjectId: 'numeracy', subjectName: 'Numeracy', missing: [{ studentId: 'bola', name: 'Bola Ade', components: ['Rating'] }] },
    ])
  })

  it('is empty when everything is entered', () => {
    expect(resultsCompleteness({ components, sheets: [{ subject: subjects[1]!, students: people }], has })).toEqual([])
  })
})

describe('transitionResults', () => {
  const admin = { role: 'admin' as const, isClassTeacher: false }
  const principal = { role: 'principal' as const, isClassTeacher: false }
  const classTeacher = { role: 'teacher' as const, isClassTeacher: true }
  const otherTeacher = { role: 'teacher' as const, isClassTeacher: false }
  const bursar = { role: 'bursar' as const, isClassTeacher: false }

  it('lets the class teacher, admin and principal submit a draft', () => {
    for (const actor of [classTeacher, admin, principal]) expect(transitionResults('draft', 'submit', actor)).toEqual({ ok: true, to: 'submitted' })
    expect(transitionResults('draft', 'submit', otherTeacher)).toMatchObject({ ok: false, reason: 'forbidden' })
    expect(transitionResults('draft', 'submit', bursar)).toMatchObject({ ok: false, reason: 'forbidden' })
  })

  it('lets only admin and principal publish, return and unpublish', () => {
    expect(transitionResults('submitted', 'publish', principal)).toEqual({ ok: true, to: 'published' })
    expect(transitionResults('submitted', 'return', admin)).toEqual({ ok: true, to: 'draft' })
    expect(transitionResults('published', 'unpublish', principal)).toEqual({ ok: true, to: 'submitted' })
    for (const action of ['publish', 'return', 'unpublish'] as const) {
      expect(transitionResults('submitted', action, classTeacher)).toMatchObject({ ok: false, reason: 'forbidden' })
    }
  })

  it('refuses moves from the wrong status', () => {
    expect(transitionResults('submitted', 'submit', classTeacher)).toEqual({ ok: false, reason: 'conflict', message: 'These results are already submitted' })
    expect(transitionResults('published', 'submit', admin)).toEqual({ ok: false, reason: 'conflict', message: 'These results are already published' })
    expect(transitionResults('draft', 'publish', admin)).toEqual({ ok: false, reason: 'conflict', message: 'Only submitted results can be published' })
    expect(transitionResults('published', 'publish', admin)).toMatchObject({ ok: false, reason: 'conflict' })
    expect(transitionResults('draft', 'return', admin)).toEqual({ ok: false, reason: 'conflict', message: 'Only submitted results can be returned to draft' })
    expect(transitionResults('submitted', 'unpublish', admin)).toEqual({ ok: false, reason: 'conflict', message: 'Only published results can be unpublished' })
  })
})

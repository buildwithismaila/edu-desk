import { describe, expect, it } from 'vitest'
import { DEFAULT_GRADE_BANDS } from '~~/shared/constants/academics'
import { AFFECTIVE_TRAITS, NURSERY_RATINGS, PSYCHOMOTOR_TRAITS, TRAIT_KEYS } from '~~/shared/constants/traits'
import { saveRatingsSchema, saveSheetSchema, sheetQuerySchema } from '~~/shared/schemas/scores'
import { gradeFor, parseScoreCell, sheetTotal, studentOffersSubject } from '~~/shared/utils/scores'

const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'
const ID_C = '33333333-3333-4333-8333-333333333333'

describe('parseScoreCell', () => {
  it('treats blank (and whitespace) as not entered', () => {
    expect(parseScoreCell('', 20)).toEqual({ ok: true, value: { score: null, absent: false } })
    expect(parseScoreCell('  ', 20)).toEqual({ ok: true, value: { score: null, absent: false } })
  })

  it('reads ABS or a (any case) as absent', () => {
    for (const input of ['ABS', 'abs', 'a', 'A', ' Abs ']) {
      expect(parseScoreCell(input, 20)).toEqual({ ok: true, value: { score: null, absent: true } })
    }
  })

  it('accepts whole numbers from 0 to the max', () => {
    expect(parseScoreCell('0', 20)).toEqual({ ok: true, value: { score: 0, absent: false } })
    expect(parseScoreCell('20', 20)).toEqual({ ok: true, value: { score: 20, absent: false } })
    expect(parseScoreCell(' 07 ', 60)).toEqual({ ok: true, value: { score: 7, absent: false } })
  })

  it('refuses scores outside 0…max, decimals and anything else', () => {
    expect(parseScoreCell('21', 20)).toEqual({ ok: false, message: 'Enter a score from 0 to 20' })
    expect(parseScoreCell('-1', 20)).toEqual({ ok: false, message: 'Enter a score from 0 to 20' })
    expect(parseScoreCell('7.5', 20)).toEqual({ ok: false, message: 'Use whole numbers' })
    expect(parseScoreCell('x', 20)).toEqual({ ok: false, message: 'Enter a number, or ABS for absent' })
    expect(parseScoreCell('1e1', 20)).toEqual({ ok: false, message: 'Enter a number, or ABS for absent' })
  })
})

describe('sheetTotal', () => {
  const score = (n: number) => ({ score: n, absent: false })
  const blank = { score: null, absent: false }
  const absent = { score: null, absent: true }

  it('is null until something is entered', () => {
    expect(sheetTotal([])).toBeNull()
    expect(sheetTotal([blank, null, blank])).toBeNull()
  })

  it('adds the scores, absent counting as 0', () => {
    expect(sheetTotal([score(15), score(12), score(48)])).toBe(75)
    expect(sheetTotal([score(15), absent, blank])).toBe(15)
    expect(sheetTotal([absent, absent, null])).toBe(0)
  })
})

describe('gradeFor', () => {
  const sss = DEFAULT_GRADE_BANDS.sss
  const jss = DEFAULT_GRADE_BANDS.jss

  it('has no grade without a total', () => {
    expect(gradeFor(null, sss)).toBeNull()
  })

  it('grades at the band boundaries (SSS)', () => {
    expect(gradeFor(39, sss)).toEqual({ grade: 'F9', remark: 'Fail' })
    expect(gradeFor(40, sss)).toEqual({ grade: 'E8', remark: 'Pass' })
    expect(gradeFor(74, sss)).toEqual({ grade: 'B2', remark: 'Very Good' })
    expect(gradeFor(75, sss)).toEqual({ grade: 'A1', remark: 'Excellent' })
    expect(gradeFor(100, sss)).toEqual({ grade: 'A1', remark: 'Excellent' })
    expect(gradeFor(0, sss)).toEqual({ grade: 'F9', remark: 'Fail' })
  })

  it('grades at the band boundaries (Primary and JSS)', () => {
    expect(gradeFor(69, jss)).toEqual({ grade: 'B', remark: 'Very Good' })
    expect(gradeFor(70, jss)).toEqual({ grade: 'A', remark: 'Excellent' })
    expect(gradeFor(39, jss)).toEqual({ grade: 'F', remark: 'Fail' })
  })

  it('has no grade when the section has no scale', () => {
    expect(gradeFor(50, [])).toBeNull()
  })
})

describe('studentOffersSubject', () => {
  it('gives core subjects to everyone', () => {
    expect(studentOffersSubject({ departmentId: null }, { departmentId: null })).toBe(true)
    expect(studentOffersSubject({ departmentId: ID_A }, { departmentId: null })).toBe(true)
  })

  it('gives department subjects only to that department', () => {
    expect(studentOffersSubject({ departmentId: ID_A }, { departmentId: ID_A })).toBe(true)
    expect(studentOffersSubject({ departmentId: ID_B }, { departmentId: ID_A })).toBe(false)
    expect(studentOffersSubject({ departmentId: null }, { departmentId: ID_A })).toBe(false)
  })
})

describe('traits', () => {
  it('lists the affective and psychomotor traits with unique keys', () => {
    expect(AFFECTIVE_TRAITS.map(t => t.label)).toEqual(['Punctuality', 'Neatness', 'Politeness', 'Honesty', 'Relationship with others', 'Attentiveness'])
    expect(PSYCHOMOTOR_TRAITS.map(t => t.label)).toEqual(['Handwriting', 'Sports', 'Drawing & crafts', 'Verbal fluency'])
    expect(new Set(TRAIT_KEYS).size).toBe(10)
    expect(NURSERY_RATINGS.map(r => r.label)).toEqual(['Excellent', 'Very Good', 'Good', 'Needs Improvement'])
  })
})

describe('saveSheetSchema', () => {
  const base = { termId: ID_A, classArmId: ID_B, subjectId: ID_C }

  it('accepts numbers, ABS and null as values', () => {
    const body = { ...base, entries: [
      { studentId: ID_A, componentId: ID_A, value: 15 },
      { studentId: ID_A, componentId: ID_B, value: 'ABS' },
      { studentId: ID_A, componentId: ID_C, value: null },
    ] }
    expect(saveSheetSchema.parse(body)).toEqual({ ...body, ratings: [] })
  })

  it('accepts Nursery ratings', () => {
    const body = { ...base, ratings: [{ studentId: ID_A, rating: 'very_good' }, { studentId: ID_B, rating: null }] }
    expect(saveSheetSchema.parse(body)).toEqual({ ...body, entries: [] })
  })

  it('refuses other values, a cell sent twice and an empty save', () => {
    expect(saveSheetSchema.safeParse({ ...base, entries: [{ studentId: ID_A, componentId: ID_A, value: 'x' }] }).success).toBe(false)
    expect(saveSheetSchema.safeParse({ ...base, entries: [{ studentId: ID_A, componentId: ID_A, value: 7.5 }] }).success).toBe(false)
    expect(saveSheetSchema.safeParse({ ...base, ratings: [{ studentId: ID_A, rating: 'great' }] }).success).toBe(false)
    const twice = saveSheetSchema.safeParse({ ...base, entries: [
      { studentId: ID_A, componentId: ID_A, value: 1 },
      { studentId: ID_A, componentId: ID_A, value: 2 },
    ] })
    expect(twice.success).toBe(false)
    expect(twice.error!.issues[0]!.message).toBe('Each cell can only be sent once')
    expect(saveSheetSchema.safeParse(base).success).toBe(false)
  })

  it('makes the term optional in the sheet query', () => {
    expect(sheetQuerySchema.parse({ classArmId: ID_B, subjectId: ID_C })).toEqual({ classArmId: ID_B, subjectId: ID_C })
  })
})

describe('saveRatingsSchema', () => {
  const base = { termId: ID_A, classArmId: ID_B }

  it('accepts 1–5 per trait (or null) and a trimmed comment', () => {
    const parsed = saveRatingsSchema.parse({ ...base, students: [{ studentId: ID_A, ratings: { punctuality: 5, handwriting: null }, comment: '  Hard-working  ' }] })
    expect(parsed.students[0]).toEqual({ studentId: ID_A, ratings: { punctuality: 5, handwriting: null }, comment: 'Hard-working' })
  })

  it('turns an empty comment into null', () => {
    expect(saveRatingsSchema.parse({ ...base, students: [{ studentId: ID_A, ratings: {}, comment: '   ' }] }).students[0]!.comment).toBeNull()
  })

  it('refuses ratings outside 1–5, unknown traits, long comments and duplicates', () => {
    const one = (student: object) => saveRatingsSchema.safeParse({ ...base, students: [{ studentId: ID_A, ratings: {}, comment: null, ...student }] }).success
    expect(one({ ratings: { punctuality: 6 } })).toBe(false)
    expect(one({ ratings: { punctuality: 0 } })).toBe(false)
    expect(one({ ratings: { cooking: 3 } })).toBe(false)
    expect(one({ comment: 'x'.repeat(501) })).toBe(false)
    expect(saveRatingsSchema.safeParse({ ...base, students: [
      { studentId: ID_A, ratings: {}, comment: null },
      { studentId: ID_A, ratings: {}, comment: null },
    ] }).success).toBe(false)
  })
})

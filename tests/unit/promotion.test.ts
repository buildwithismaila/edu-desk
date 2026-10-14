import { describe, expect, it } from 'vitest'
import { defaultPlacement, nextLevel, validatePromotion } from '~~/shared/utils/promotion'

// A school's class order (deliberately shuffled): Nursery 2, Primary 1, Primary 6, JSS 1, JSS 3, SSS 1, SSS 3
const levels = [
  { id: 'sss3', section: 'sss' as const, sortOrder: 3, name: 'SSS 3' },
  { id: 'p1', section: 'primary' as const, sortOrder: 1, name: 'Primary 1' },
  { id: 'jss1', section: 'jss' as const, sortOrder: 1, name: 'JSS 1' },
  { id: 'n2', section: 'nursery' as const, sortOrder: 2, name: 'Nursery 2' },
  { id: 'sss1', section: 'sss' as const, sortOrder: 1, name: 'SSS 1' },
  { id: 'p6', section: 'primary' as const, sortOrder: 6, name: 'Primary 6' },
  { id: 'jss3', section: 'jss' as const, sortOrder: 3, name: 'JSS 3' },
]
const arm = (id: string, classLevelId: string, name: string) => ({ id, classLevelId, name })
const arms = [
  arm('n2a', 'n2', 'A'),
  arm('p1a', 'p1', 'A'),
  arm('p6a', 'p6', 'A'), arm('p6b', 'p6', 'B'),
  arm('jss1a', 'jss1', 'A'),
  arm('jss3a', 'jss3', 'A'), arm('jss3gold', 'jss3', 'Gold'),
  arm('sss1a', 'sss1', 'A'),
  arm('sss3a', 'sss3', 'A'),
]
const find = (id: string) => arms.find(a => a.id === id)!

describe('nextLevel', () => {
  it('follows the sort order within a section', () => {
    expect(nextLevel(levels, 'jss1')?.id).toBe('jss3')
    expect(nextLevel(levels, 'p1')?.id).toBe('p6')
  })

  it('crosses sections in order: Nursery → Primary → JSS → SSS', () => {
    expect(nextLevel(levels, 'n2')?.id).toBe('p1')
    expect(nextLevel(levels, 'p6')?.id).toBe('jss1')
    expect(nextLevel(levels, 'jss3')?.id).toBe('sss1')
  })

  it('has none after the last level, or for an unknown level', () => {
    expect(nextLevel(levels, 'sss3')).toBeNull()
    expect(nextLevel(levels, 'nope')).toBeNull()
  })
})

describe('defaultPlacement', () => {
  it('promotes into the next level\'s arm with the same name', () => {
    expect(defaultPlacement({ levels, arms, fromArm: find('n2a') })).toEqual({ outcome: 'promoted', toClassArmId: 'p1a' })
    expect(defaultPlacement({ levels, arms, fromArm: find('jss3a') })).toEqual({ outcome: 'promoted', toClassArmId: 'sss1a' })
  })

  it('leaves the target empty when the next level has no arm with that name', () => {
    expect(defaultPlacement({ levels, arms, fromArm: find('p6b') })).toEqual({ outcome: 'promoted', toClassArmId: null })
    expect(defaultPlacement({ levels, arms, fromArm: find('jss3gold') })).toEqual({ outcome: 'promoted', toClassArmId: null })
  })

  it('graduates the last level', () => {
    expect(defaultPlacement({ levels, arms, fromArm: find('sss3a') })).toEqual({ outcome: 'graduated', toClassArmId: null })
  })
})

describe('validatePromotion', () => {
  const check = (fromArm: string, rows: Parameters<typeof validatePromotion>[0]) => validatePromotion(rows, { levels, arms, fromArm: find(fromArm) })

  it('accepts every valid outcome', () => {
    expect(check('p6b', [
      { studentId: 's1', outcome: 'promoted', toClassArmId: 'jss1a' },
      { studentId: 's2', outcome: 'repeated', toClassArmId: 'p6a' },
      { studentId: 's3', outcome: 'withdrawn', toClassArmId: null },
      { studentId: 's4', outcome: 'graduated' },
    ])).toEqual([])
  })

  it('needs a class for promoted and repeating students', () => {
    expect(check('p6a', [
      { studentId: 's1', outcome: 'promoted', toClassArmId: null },
      { studentId: 's2', outcome: 'repeated' },
      { studentId: 's3', outcome: 'promoted', toClassArmId: 'unknown' },
    ])).toEqual([
      { studentId: 's1', message: 'Choose a class' },
      { studentId: 's2', message: 'Choose a class' },
      { studentId: 's3', message: 'Choose a class' },
    ])
  })

  it('keeps repeating students in the same level, and promotes only to a later one', () => {
    expect(check('p6a', [
      { studentId: 's1', outcome: 'repeated', toClassArmId: 'jss1a' },
      { studentId: 's2', outcome: 'promoted', toClassArmId: 'p6b' },
      { studentId: 's3', outcome: 'promoted', toClassArmId: 'p1a' },
    ])).toEqual([
      { studentId: 's1', message: 'A repeating student stays in Primary 6' },
      { studentId: 's2', message: 'Promote to a later class' },
      { studentId: 's3', message: 'Promote to a later class' },
    ])
  })

  it('gives graduating and withdrawn students no class', () => {
    expect(check('sss3a', [
      { studentId: 's1', outcome: 'graduated', toClassArmId: 'sss3a' },
      { studentId: 's2', outcome: 'withdrawn', toClassArmId: 'sss3a' },
    ])).toEqual([
      { studentId: 's1', message: 'A graduating student doesn\'t get a class' },
      { studentId: 's2', message: 'A withdrawn student doesn\'t get a class' },
    ])
  })

  it('can\'t promote past the last level', () => {
    expect(check('sss3a', [{ studentId: 's1', outcome: 'promoted', toClassArmId: 'sss3a' }]))
      .toEqual([{ studentId: 's1', message: 'Promote to a later class' }])
  })
})

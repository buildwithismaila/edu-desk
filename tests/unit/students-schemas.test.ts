import { describe, expect, it } from 'vitest'
import { admitStudentSchema, studentGuardianSchema, updateStudentSchema } from '~~/shared/schemas/students'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const valid = {
  firstName: ' Ada ',
  lastName: 'Obi',
  gender: 'female',
  dateOfBirth: '2014-02-14',
  stateOfOrigin: 'Anambra',
  classArmId: uuid(1),
  guardians: [{ name: 'Ngozi Obi', phone: '0803 111 0001', relationship: 'mother' }],
}

describe('admitStudentSchema', () => {
  it('normalises names, phone and empty optionals', () => {
    const parsed = admitStudentSchema.parse({ ...valid, middleName: '', lga: '', admissionNumber: '' })

    expect(parsed).toMatchObject({
      firstName: 'Ada',
      middleName: null,
      lga: null,
      admissionNumber: null,
      guardians: [{ name: 'Ngozi Obi', phone: '+2348031110001', email: null, relationship: 'mother' }],
    })
  })

  it('accepts an existing guardian by id', () => {
    const parsed = admitStudentSchema.parse({ ...valid, guardians: [{ guardianId: uuid(9), relationship: 'father' }] })
    expect(parsed.guardians).toEqual([{ guardianId: uuid(9), relationship: 'father' }])
  })

  it.each([
    ['no guardians', { guardians: [] }, 'guardians'],
    ['five guardians', { guardians: Array.from({ length: 5 }, () => valid.guardians[0]) }, 'guardians'],
    ['a guardian without a phone', { guardians: [{ name: 'Ngozi', relationship: 'mother' }] }, 'guardians'],
    ['an invalid gender', { gender: 'other' }, 'gender'],
    ['an unknown state', { stateOfOrigin: 'Accra' }, 'stateOfOrigin'],
    ['a future date of birth', { dateOfBirth: '2999-01-01' }, 'dateOfBirth'],
    ['a missing class arm', { classArmId: undefined }, 'classArmId'],
  ])('rejects %s', (_case, override, field) => {
    const result = admitStudentSchema.safeParse({ ...valid, ...override })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map(i => i.path[0])).toContain(field)
  })

  it('rejects the same existing guardian twice', () => {
    const result = admitStudentSchema.safeParse({
      ...valid,
      guardians: [{ guardianId: uuid(9), relationship: 'father' }, { guardianId: uuid(9), relationship: 'guardian' }],
    })
    expect(result.success).toBe(false)
  })
})

describe('updateStudentSchema', () => {
  it('accepts a partial update and normalises the state', () => {
    expect(updateStudentSchema.parse({ stateOfOrigin: 'akwa-ibom' })).toEqual({ stateOfOrigin: 'Akwa Ibom' })
  })
})

describe('studentGuardianSchema', () => {
  it('defaults the relationship to guardian', () => {
    expect(studentGuardianSchema.parse({ guardianId: uuid(3) })).toEqual({ guardianId: uuid(3), relationship: 'guardian' })
  })
})

import { describe, expect, it } from 'vitest'
import { IMPORT_COLUMNS, type ImportContext, validateImportFile } from '~~/shared/schemas/student-import'

const ctx: ImportContext = {
  arms: new Map([
    ['jss 1a', { id: 'arm-jss1a', section: 'jss' as const }],
    ['sss 1a', { id: 'arm-sss1a', section: 'sss' as const }],
  ]),
  departments: new Map([['science', 'dept-science']]),
  existingAdmissionNumbers: new Set(['GFA/2025/0001']),
}

const header = [...IMPORT_COLUMNS]
const good = {
  firstName: 'Ada', middleName: '', lastName: 'Obi', gender: 'F', dateOfBirth: '14/02/2014',
  stateOfOrigin: 'Anambra', lga: 'Onitsha North', address: '', classArm: 'JSS 1A', department: '',
  admissionNumber: '', guardianName: 'Ngozi Obi', guardianPhone: '0803 111 0001', guardianEmail: '',
  guardianRelationship: 'mother',
}
const row = (overrides: Partial<typeof good> = {}) => header.map(column => ({ ...good, ...overrides })[column])

describe('validateImportFile', () => {
  it('turns valid rows into typed values', () => {
    const result = validateImportFile([header, row()], ctx)

    expect(result.errors).toEqual([])
    expect(result.rows).toEqual([{
      row: 2,
      firstName: 'Ada',
      middleName: null,
      lastName: 'Obi',
      gender: 'female',
      dateOfBirth: '2014-02-14',
      stateOfOrigin: 'Anambra',
      lga: 'Onitsha North',
      address: null,
      classArmId: 'arm-jss1a',
      departmentId: null,
      admissionNumber: null,
      guardian: { name: 'Ngozi Obi', phone: '+2348031110001', email: null, relationship: 'mother' },
    }])
  })

  it('accepts columns in any order and ignores letter case in headers', () => {
    const shuffled = [...header].reverse()
    const values = row().reverse()
    const result = validateImportFile([shuffled.map(h => h.toUpperCase()), values], ctx)
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(1)
  })

  it('reports missing required columns once, on the header row', () => {
    const result = validateImportFile([['firstName', 'lastName'], ['Ada', 'Obi']], ctx)

    expect(result.rows).toEqual([])
    expect(result.errors).toEqual([{ row: 1, column: 'gender, classArm, guardianName, guardianPhone', message: 'Missing required columns' }])
  })

  it('reports an empty file', () => {
    expect(validateImportFile([], ctx).errors).toEqual([{ row: 1, column: '', message: 'The file is empty' }])
    expect(validateImportFile([header], ctx).errors).toEqual([{ row: 1, column: '', message: 'The file has no student rows' }])
  })

  it.each([
    ['a missing first name', { firstName: '' }, 'firstName', 'Required'],
    ['an unknown gender', { gender: 'X' }, 'gender', 'Use M, F, Male or Female'],
    ['a date in the wrong format', { dateOfBirth: '2014-02-14' }, 'dateOfBirth', 'Use DD/MM/YYYY, e.g. 14/02/2014'],
    ['an impossible date', { dateOfBirth: '30/02/2014' }, 'dateOfBirth', 'Use DD/MM/YYYY, e.g. 14/02/2014'],
    ['a future date of birth', { dateOfBirth: '01/01/2999' }, 'dateOfBirth', 'Date of birth can\'t be in the future'],
    ['an unknown state', { stateOfOrigin: 'Accra' }, 'stateOfOrigin', 'Not a Nigerian state'],
    ['an unknown class arm', { classArm: 'JSS 9Z' }, 'classArm', 'No class arm called "JSS 9Z"'],
    ['a department on a JSS arm', { department: 'Science' }, 'department', 'Only SSS students have a department'],
    ['an unknown department', { classArm: 'SSS 1A', department: 'Magic' }, 'department', 'No department called "Magic"'],
    ['an admission number already used', { admissionNumber: 'GFA/2025/0001' }, 'admissionNumber', 'GFA/2025/0001 is already used'],
    ['a bad guardian phone', { guardianPhone: '12345' }, 'guardianPhone', 'Enter a Nigerian phone number'],
    ['a bad guardian email', { guardianEmail: 'nope' }, 'guardianEmail', 'Enter a valid email address'],
    ['an unknown relationship', { guardianRelationship: 'uncle' }, 'guardianRelationship', 'Use father, mother, guardian or other'],
  ])('reports %s', (_case, overrides, column, message) => {
    const result = validateImportFile([header, row(overrides)], ctx)

    expect(result.rows).toEqual([])
    expect(result.errors).toEqual([{ row: 2, column, message }])
  })

  it('accepts M/Male/F/Female in any case, an SSS department and an empty relationship', () => {
    const result = validateImportFile([
      header,
      row({ gender: 'male' }),
      row({ gender: 'm', classArm: 'sss 1a', department: 'science', guardianRelationship: '' }),
    ], ctx)

    expect(result.errors).toEqual([])
    expect(result.rows.map(r => [r.gender, r.departmentId, r.guardian.relationship])).toEqual([
      ['male', null, 'mother'],
      ['male', 'dept-science', 'guardian'],
    ])
  })

  it('reports an admission number used twice in the file, on both rows', () => {
    const result = validateImportFile([header, row({ admissionNumber: 'X/1' }), row(), row({ admissionNumber: 'x/1' })], ctx)

    expect(result.errors).toEqual([
      { row: 2, column: 'admissionNumber', message: 'X/1 appears more than once in the file' },
      { row: 4, column: 'admissionNumber', message: 'x/1 appears more than once in the file' },
    ])
  })

  it('reports every problem in every row, with spreadsheet row numbers', () => {
    const result = validateImportFile([header, row(), row({ firstName: '', gender: '?' }), row({ classArm: '' })], ctx)

    expect(result.errors).toEqual([
      { row: 3, column: 'firstName', message: 'Required' },
      { row: 3, column: 'gender', message: 'Use M, F, Male or Female' },
      { row: 4, column: 'classArm', message: 'Required' },
    ])
  })

  it('reports a row with the wrong number of values', () => {
    const result = validateImportFile([header, ['Ada', 'Obi']], ctx)
    expect(result.errors).toEqual([{ row: 2, column: '', message: `Expected ${header.length} values, found 2` }])
  })
})

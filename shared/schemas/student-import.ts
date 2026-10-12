import { z } from 'zod'
import type { Section } from '../constants/academics'
import { normaliseState } from '../constants/states'
import { normalisePhone } from '../utils/phone'
import { emailSchema } from './auth'
import { RELATIONSHIPS } from './students'

// Student CSV import (docs/features/04-students.md). Pure: the server supplies the school's arms,
// departments and existing admission numbers. Row numbers match the spreadsheet (header = row 1).

export const IMPORT_COLUMNS = [
  'firstName', 'middleName', 'lastName', 'gender', 'dateOfBirth', 'stateOfOrigin', 'lga', 'address',
  'classArm', 'department', 'admissionNumber', 'guardianName', 'guardianPhone', 'guardianEmail', 'guardianRelationship',
] as const
type Column = typeof IMPORT_COLUMNS[number]

const REQUIRED: Column[] = ['firstName', 'lastName', 'gender', 'classArm', 'guardianName', 'guardianPhone']

export const IMPORT_MAX_ROWS = 1000
export const IMPORT_MAX_BYTES = 1024 * 1024

export interface ImportContext {
  /** lowercased arm label ("jss 1a") → arm */
  arms: Map<string, { id: string, section: Section }>
  /** lowercased department name → id */
  departments: Map<string, string>
  /** admission numbers already used in the school (any case) */
  existingAdmissionNumbers: Set<string>
}

export interface ImportError { row: number, column: string, message: string }

export interface ImportRow {
  row: number
  firstName: string
  middleName: string | null
  lastName: string
  gender: 'male' | 'female'
  dateOfBirth: string | null
  stateOfOrigin: string | null
  lga: string | null
  address: string | null
  classArmId: string
  departmentId: string | null
  admissionNumber: string | null
  guardian: { name: string, phone: string, email: string | null, relationship: typeof RELATIONSHIPS[number] }
}

const GENDER: Record<string, 'male' | 'female'> = { m: 'male', male: 'male', f: 'female', female: 'female' }
const DATE_FORMAT = 'Use DD/MM/YYYY, e.g. 14/02/2014'

/** DD/MM/YYYY → YYYY-MM-DD if it's a real date; null otherwise. */
function parseDate(value: string) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value)
  if (!match) return null
  const [, d, m, y] = match.map(Number) as [number, number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return date.toISOString().slice(0, 10)
}

/** Validates a parsed CSV (rows of strings, first row = header). Returns typed rows or every error. */
export function validateImportFile(table: string[][], ctx: ImportContext): { rows: ImportRow[], errors: ImportError[] } {
  if (table.length === 0) return { rows: [], errors: [{ row: 1, column: '', message: 'The file is empty' }] }
  if (table.length === 1) return { rows: [], errors: [{ row: 1, column: '', message: 'The file has no student rows' }] }

  const header = table[0]!.map(h => h.trim().toLowerCase())
  const index = new Map(IMPORT_COLUMNS.map(column => [column, header.indexOf(column.toLowerCase())]))
  const missing = REQUIRED.filter(column => index.get(column) === -1)
  if (missing.length) return { rows: [], errors: [{ row: 1, column: missing.join(', '), message: 'Missing required columns' }] }

  const errors: ImportError[] = []
  const rows: ImportRow[] = []
  const today = new Date().toISOString().slice(0, 10)
  const seenNumbers = new Map<string, number[]>()

  table.slice(1).forEach((values, i) => {
    const rowNumber = i + 2
    if (values.length !== header.length) {
      errors.push({ row: rowNumber, column: '', message: `Expected ${header.length} values, found ${values.length}` })
      return
    }
    const get = (column: Column) => {
      const at = index.get(column)!
      return at === -1 ? '' : values[at]!.trim()
    }
    const rowErrors: ImportError[] = []
    const fail = (column: Column, message: string) => rowErrors.push({ row: rowNumber, column, message })

    for (const column of REQUIRED) if (!get(column)) fail(column, 'Required')

    const gender = GENDER[get('gender').toLowerCase()]
    if (get('gender') && !gender) fail('gender', 'Use M, F, Male or Female')

    let dateOfBirth: string | null = null
    if (get('dateOfBirth')) {
      dateOfBirth = parseDate(get('dateOfBirth'))
      if (!dateOfBirth) fail('dateOfBirth', DATE_FORMAT)
      else if (dateOfBirth > today) fail('dateOfBirth', 'Date of birth can\'t be in the future')
    }

    const stateOfOrigin = get('stateOfOrigin') ? normaliseState(get('stateOfOrigin')) : null
    if (get('stateOfOrigin') && !stateOfOrigin) fail('stateOfOrigin', 'Not a Nigerian state')

    const arm = get('classArm') ? ctx.arms.get(get('classArm').toLowerCase().replace(/\s+/g, ' ')) : undefined
    if (get('classArm') && !arm) fail('classArm', `No class arm called "${get('classArm')}"`)

    let departmentId: string | null = null
    if (get('department')) {
      if (arm && arm.section !== 'sss') {
        fail('department', 'Only SSS students have a department')
      }
      else {
        departmentId = ctx.departments.get(get('department').toLowerCase()) ?? null
        if (!departmentId) fail('department', `No department called "${get('department')}"`)
      }
    }

    const admissionNumber = get('admissionNumber') || null
    if (admissionNumber) {
      const normalised = admissionNumber.toLowerCase()
      if ([...ctx.existingAdmissionNumbers].some(n => n.toLowerCase() === normalised)) {
        fail('admissionNumber', `${admissionNumber} is already used`)
      }
      seenNumbers.set(normalised, [...(seenNumbers.get(normalised) ?? []), rowNumber])
    }

    const phone = get('guardianPhone') ? normalisePhone(get('guardianPhone')) : null
    if (get('guardianPhone') && !phone) fail('guardianPhone', 'Enter a Nigerian phone number')

    const email = get('guardianEmail') ? emailSchema.safeParse(get('guardianEmail')) : null
    if (email && !email.success) fail('guardianEmail', 'Enter a valid email address')

    const relationshipRaw = get('guardianRelationship').toLowerCase() || 'guardian'
    const relationship = z.enum(RELATIONSHIPS).safeParse(relationshipRaw)
    if (!relationship.success) fail('guardianRelationship', 'Use father, mother, guardian or other')

    if (rowErrors.length) {
      errors.push(...rowErrors)
      return
    }
    rows.push({
      row: rowNumber,
      firstName: get('firstName'),
      middleName: get('middleName') || null,
      lastName: get('lastName'),
      gender: gender!,
      dateOfBirth,
      stateOfOrigin,
      lga: get('lga') || null,
      address: get('address') || null,
      classArmId: arm!.id,
      departmentId,
      admissionNumber,
      guardian: { name: get('guardianName'), phone: phone!, email: email?.data ?? null, relationship: relationship.data! },
    })
  })

  // Admission numbers repeated within the file: report on every row that uses them
  for (const [, rowNumbers] of seenNumbers) {
    if (rowNumbers.length < 2) continue
    for (const rowNumber of rowNumbers) {
      const value = table[rowNumber - 1]![index.get('admissionNumber')!]!.trim()
      errors.push({ row: rowNumber, column: 'admissionNumber', message: `${value} appears more than once in the file` })
    }
  }
  const failed = new Set(errors.map(e => e.row))
  errors.sort((a, b) => a.row - b.row)
  return { rows: rows.filter(r => !failed.has(r.row)), errors }
}

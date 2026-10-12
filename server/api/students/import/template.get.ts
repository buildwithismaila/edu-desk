import { defineEventHandler, setResponseHeaders } from 'h3'
import { IMPORT_COLUMNS } from '../../../../shared/schemas/student-import'
import { requireRole } from '../../../utils/auth'
import { requireTenant } from '../../../utils/tenant'

const EXAMPLE: Record<typeof IMPORT_COLUMNS[number], string> = {
  firstName: 'Ada',
  middleName: 'Chioma',
  lastName: 'Okafor',
  gender: 'F',
  dateOfBirth: '14/02/2014',
  stateOfOrigin: 'Anambra',
  lga: 'Awka South',
  address: '12 Zik Avenue Awka',
  classArm: 'JSS 1A',
  department: '',
  admissionNumber: '',
  guardianName: 'Ngozi Okafor',
  guardianPhone: '08031234567',
  guardianEmail: 'ngozi.okafor@example.com',
  guardianRelationship: 'mother',
}

/** Admin: the import CSV template (every column and one example row). */
export default defineEventHandler(async (event) => {
  requireTenant(event)
  await requireRole(event, ['admin'])
  setResponseHeaders(event, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': 'attachment; filename="students-template.csv"',
  })
  return `${IMPORT_COLUMNS.join(',')}\r\n${IMPORT_COLUMNS.map(c => EXAMPLE[c]).join(',')}\r\n`
})

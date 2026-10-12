import { z } from 'zod'
import { normaliseState } from '../constants/states'
import { normalisePhone } from '../utils/phone'
import { emailSchema } from './auth'
import { isoDateSchema } from './academics'

export const GENDERS = ['male', 'female'] as const
export const RELATIONSHIPS = ['father', 'mother', 'guardian', 'other'] as const
export const MAX_GUARDIANS = 4

/** Empty or whitespace → null. */
const optionalText = (max: number) => z.string().trim().max(max, `Use at most ${max} characters`).nullable().optional()
  .transform(v => v || null)
const name = (label: string) => z.string().trim().min(1, `Enter the ${label}`).max(60, 'Use at most 60 characters')

const stateSchema = z.string().nullable().optional().transform((value, ctx) => {
  if (!value?.trim()) return null
  const state = normaliseState(value)
  if (!state) {
    ctx.addIssue({ code: 'custom', message: 'Choose a Nigerian state' })
    return z.NEVER
  }
  return state
})

const dateOfBirthSchema = z.union([z.literal('').transform(() => null), isoDateSchema]).nullable().optional()
  .transform(v => v ?? null)
  .refine(v => !v || v <= new Date().toISOString().slice(0, 10), 'Date of birth can\'t be in the future')

export const requiredPhoneSchema = z.string().trim().min(1, 'Enter a phone number').transform((value, ctx) => {
  const phone = normalisePhone(value)
  if (!phone) {
    ctx.addIssue({ code: 'custom', message: 'Enter a Nigerian phone number, e.g. 0803 123 4567' })
    return z.NEVER
  }
  return phone
})

const relationshipSchema = z.enum(RELATIONSHIPS, 'Choose a relationship').default('guardian')

/** A new guardian: becomes a parent account (phone required; email optional). */
export const newGuardianSchema = z.object({
  name: z.string().trim().min(2, 'Enter the guardian\'s full name').max(100, 'Use at most 100 characters'),
  phone: requiredPhoneSchema,
  email: z.union([z.literal(''), emailSchema]).nullable().optional().transform(v => v || null),
  relationship: relationshipSchema,
})

/** Link an existing guardian (e.g. a sibling's parent). */
export const existingGuardianSchema = z.object({
  guardianId: z.uuid('Choose a guardian'),
  relationship: relationshipSchema,
})

export const studentGuardianSchema = z.union([existingGuardianSchema, newGuardianSchema])

/** PATCH /api/guardians/[id]: name, phone, email ('' clears the email). */
export const updateGuardianSchema = newGuardianSchema.omit({ relationship: true }).partial()

export const guardianSearchSchema = z.object({ search: z.string().trim().max(60).optional() })

const studentFields = {
  firstName: name('first name'),
  middleName: optionalText(60),
  lastName: name('last name'),
  gender: z.enum(GENDERS, 'Choose a gender'),
  dateOfBirth: dateOfBirthSchema,
  stateOfOrigin: stateSchema,
  lga: optionalText(80),
  address: optionalText(300),
  /** SSS only; checked against the class arm on the server */
  departmentId: z.uuid().nullable().optional().transform(v => v ?? null),
}

export const admitStudentSchema = z.object({
  ...studentFields,
  classArmId: z.uuid('Choose a class'),
  /** Optional manual admission number (e.g. from the old register); generated when empty */
  admissionNumber: z.string().trim().max(30, 'Use at most 30 characters').nullable().optional().transform(v => v || null),
  sessionId: z.uuid().optional(),
  guardians: z.array(studentGuardianSchema)
    .min(1, 'Add at least one guardian')
    .max(MAX_GUARDIANS, `Add at most ${MAX_GUARDIANS} guardians`)
    .refine((list) => {
      const ids = list.flatMap(g => 'guardianId' in g ? [g.guardianId] : [])
      const phones = list.flatMap(g => 'phone' in g ? [g.phone] : [])
      return new Set(ids).size === ids.length && new Set(phones).size === phones.length
    }, 'Each guardian can only be added once'),
})

/** PATCH: any subset of the bio fields and department. */
export const updateStudentSchema = z.object(studentFields).partial()

export const enrolmentSchema = z.object({
  classArmId: z.uuid('Choose a class'),
  sessionId: z.uuid().optional(),
})

export type AdmitStudentInput = z.input<typeof admitStudentSchema>
export type NewGuardianInput = z.input<typeof newGuardianSchema>

export const STUDENT_PAGE_SIZE = 25

/** GET /api/students query: server-side pagination, search and filters. */
export const studentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(STUDENT_PAGE_SIZE),
  search: z.string().trim().max(60).optional().transform(v => v || undefined),
  classLevelId: z.uuid().optional(),
  classArmId: z.uuid().optional(),
  gender: z.enum(GENDERS).optional(),
  sessionId: z.uuid().optional(),
})

export type StudentListQuery = z.input<typeof studentListQuerySchema>

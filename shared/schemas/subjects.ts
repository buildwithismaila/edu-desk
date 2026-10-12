import { z } from 'zod'
import { SECTIONS } from '../constants/academics'

export const departmentSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(60, 'Use at most 60 characters'),
})

const subjectFields = z.object({
  section: z.enum(SECTIONS, 'Choose a section'),
  name: z.string().trim().min(1, 'Enter a name').max(80, 'Use at most 80 characters'),
  /** Short code for broadsheets, e.g. MTH; stored uppercase. */
  code: z.string().trim().max(10, 'Use at most 10 characters').nullable().optional()
    .transform(v => v ? v.toUpperCase() : null),
  /** SSS only; null = core subject. */
  departmentId: z.uuid('Choose a department').nullable().optional().transform(v => v ?? null),
})

const departmentOnlyForSss = (s: { section: string, departmentId: string | null }) => !s.departmentId || s.section === 'sss'
const departmentRule = { path: ['departmentId'], message: 'Only SSS subjects belong to a department' }

export const subjectSchema = subjectFields.refine(departmentOnlyForSss, departmentRule)

/** PATCH body; the route re-checks the merged subject with subjectSchema. */
export const subjectPatchSchema = subjectFields.partial()

export type SubjectInput = z.input<typeof subjectSchema>

export const subjectsQuerySchema = z.object({ section: z.enum(SECTIONS).optional() })

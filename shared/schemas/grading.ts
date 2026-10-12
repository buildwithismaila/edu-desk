import { z } from 'zod'
import { GRADED_SECTIONS } from '../constants/academics'
import { validateAssessmentComponents } from '../utils/assessment'
import { validateGradeBands } from '../utils/grading'

// The list rules (sum to 100, contiguous bands, …) live in shared/utils; each problem becomes an issue
// on the list field, so the API returns them as fieldErrors.components / fieldErrors.bands.

export const assessmentComponentsSchema = z.object({
  components: z.array(z.object({
    name: z.string().trim().max(30, 'Use at most 30 characters'),
    maxScore: z.number(),
  })),
}).superRefine(({ components }, ctx) => {
  for (const message of validateAssessmentComponents(components)) ctx.addIssue({ code: 'custom', path: ['components'], message })
})

export const gradeBandsSchema = z.object({
  bands: z.array(z.object({
    grade: z.string().trim().max(5, 'Use at most 5 characters'),
    minScore: z.number(),
    maxScore: z.number(),
    remark: z.string().trim().max(40, 'Use at most 40 characters').default(''),
  })),
}).superRefine(({ bands }, ctx) => {
  for (const message of validateGradeBands(bands)) ctx.addIssue({ code: 'custom', path: ['bands'], message })
})

export const gradedSectionParamsSchema = z.object({
  section: z.enum(GRADED_SECTIONS, 'Only Primary, JSS and SSS have grading scales'),
})

export type AssessmentComponentsInput = z.input<typeof assessmentComponentsSchema>
export type GradeBandsInput = z.input<typeof gradeBandsSchema>

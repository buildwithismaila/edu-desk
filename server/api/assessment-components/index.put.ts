import { defineEventHandler } from 'h3'
import { assessmentComponentsSchema } from '../../../shared/schemas/grading'
import { replaceAssessmentComponents } from '../../services/grading'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateBody } from '../../utils/validation'

/** Admin: replace the assessment split; the maxima must sum to 100. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { components } = await validateBody(event, assessmentComponentsSchema)
  return replaceAssessmentComponents(useDb(), school, components)
})

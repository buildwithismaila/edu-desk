import { defineEventHandler } from 'h3'
import { gradedSectionParamsSchema, gradeBandsSchema } from '../../../shared/schemas/grading'
import { replaceGradingScale } from '../../services/grading'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateBody, validateParams } from '../../utils/validation'

/** Admin: replace one section's grading scale; bands must be contiguous and cover 0–100. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { section } = validateParams(event, gradedSectionParamsSchema)
  const { bands } = await validateBody(event, gradeBandsSchema)
  return replaceGradingScale(useDb(), school, section, bands)
})

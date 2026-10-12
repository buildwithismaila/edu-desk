import { defineEventHandler } from 'h3'
import { z } from 'zod'
import { unlinkGuardian } from '../../../../services/guardians'
import { requireRole } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { requireTenant } from '../../../../utils/tenant'
import { validateParams } from '../../../../utils/validation'

/** Admin: unlink a guardian from a student (409 for the last one). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin'])
  const { id, guardianId } = validateParams(event, z.object({ id: z.uuid(), guardianId: z.uuid() }))
  await unlinkGuardian(useDb(), school, id, guardianId)
  return { unlinked: true }
})

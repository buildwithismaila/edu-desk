import { defineEventHandler } from 'h3'
import { STAFF_ROLES } from '../../../shared/constants/roles'
import { listClassLevels } from '../../services/classes'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'

export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, STAFF_ROLES)
  return listClassLevels(useDb(), school)
})

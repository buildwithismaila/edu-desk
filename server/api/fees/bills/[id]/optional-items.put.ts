import { defineEventHandler } from 'h3'
import { optionalItemsSchema } from '../../../../../shared/schemas/fees'
import { billDetails, setOptionalItems } from '../../../../services/fees'
import { idParamsSchema, validateBody, validateParams } from '../../../../utils/validation'
import { requireRole } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { requireTenant } from '../../../../utils/tenant'

/** Set the student's optional items (e.g. Bus) on a bill. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  await requireRole(event, ['admin', 'bursar'])
  const { id } = validateParams(event, idParamsSchema)
  const { feeItemIds } = await validateBody(event, optionalItemsSchema)
  const db = useDb()
  await setOptionalItems(db, school, id, feeItemIds)
  return billDetails(db, school, id)
})

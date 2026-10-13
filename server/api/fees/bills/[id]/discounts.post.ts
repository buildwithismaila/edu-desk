import { defineEventHandler, setResponseStatus } from 'h3'
import { discountSchema } from '../../../../../shared/schemas/fees'
import { addDiscount, billDetails } from '../../../../services/fees'
import { idParamsSchema, validateBody, validateParams } from '../../../../utils/validation'
import { requireRole } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { requireTenant } from '../../../../utils/tenant'

/** Add a fixed or percent discount to a bill (capped at the items when applied). */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'bursar'])
  const { id } = validateParams(event, idParamsSchema)
  const input = await validateBody(event, discountSchema)
  const db = useDb()
  await addDiscount(db, school, user, id, input)
  setResponseStatus(event, 201)
  return billDetails(db, school, id)
})

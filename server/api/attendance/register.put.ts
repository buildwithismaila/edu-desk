import { defineEventHandler, setResponseStatus } from 'h3'
import { saveRegisterSchema } from '../../../shared/schemas/attendance'
import { SCHOOL_TIME_ZONE, todayIn } from '../../../shared/utils/dates'
import { saveRegister } from '../../services/attendance'
import { requireRole } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { requireTenant } from '../../utils/tenant'
import { validateBody } from '../../utils/validation'

/** Take or correct a register (every student in the arm). 201 when created, 200 when updated. */
export default defineEventHandler(async (event) => {
  const school = requireTenant(event)
  const user = await requireRole(event, ['admin', 'principal', 'teacher'])
  const input = await validateBody(event, saveRegisterSchema)
  const { created, register } = await saveRegister(useDb(), school, user, input, todayIn(SCHOOL_TIME_ZONE))
  setResponseStatus(event, created ? 201 : 200)
  return register
})

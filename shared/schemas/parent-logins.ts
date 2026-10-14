import { z } from 'zod'
import { PARENT_LOGIN_STATUSES } from '../utils/parent-logins'

export const parentLoginsQuerySchema = z.object({
  classArmId: z.uuid().optional(),
  status: z.enum(PARENT_LOGIN_STATUSES).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
})

/** Exactly one of: every parent without a login, one class's, or chosen parents. */
export const generateParentLoginsSchema = z.object({
  all: z.literal(true).optional(),
  classArmId: z.uuid().optional(),
  guardianIds: z.array(z.uuid()).min(1).max(1000).optional(),
  includeActive: z.boolean().optional(),
}).refine(v => [v.all, v.classArmId, v.guardianIds].filter(x => x !== undefined).length === 1, {
  message: 'Choose all parents without a login, one class, or some parents',
  path: ['all'],
})

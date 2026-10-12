import { z } from 'zod'
import { STAFF_ROLES } from '../constants/roles'
import { emailSchema } from './auth'
import { optionalPhoneSchema } from './common'

const staffFields = {
  name: z.string().trim().min(2, 'Enter the full name').max(100, 'Use at most 100 characters'),
  email: emailSchema,
  phone: optionalPhoneSchema,
  role: z.enum(STAFF_ROLES, 'Choose a staff role'),
}

export const createStaffSchema = z.object(staffFields)

/** PATCH: any subset; a phone of '' / null clears it. */
export const updateStaffSchema = z.object(staffFields).partial()

export const staffListQuerySchema = z.object({ status: z.enum(['active', 'inactive']).optional() })

export type CreateStaffInput = z.input<typeof createStaffSchema>
export type UpdateStaffInput = z.input<typeof updateStaffSchema>

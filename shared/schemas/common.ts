import { z } from 'zod'
import { normalisePhone } from '../utils/phone'

/** Optional Nigerian phone: empty → null, otherwise normalised to `+234…` (docs/domain.md). */
export const optionalPhoneSchema = z.string().trim().nullable().optional().transform((value, ctx) => {
  if (!value) return null
  const phone = normalisePhone(value)
  if (!phone) {
    ctx.addIssue({ code: 'custom', message: 'Enter a Nigerian phone number, e.g. 0803 123 4567' })
    return z.NEVER
  }
  return phone
})

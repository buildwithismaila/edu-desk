import { z } from 'zod'
import { formatNaira, MAX_AMOUNT_KOBO, parseNaira } from '../utils/money'
import { isoDateSchema } from './academics'

const id = () => z.uuid('Invalid id')

export const PAYMENT_METHODS = ['cash', 'transfer', 'pos'] as const
export const PAYMENT_METHOD_LABELS: Record<typeof PAYMENT_METHODS[number], string> = { cash: 'Cash', transfer: 'Bank transfer', pos: 'POS' }

/** An amount typed in naira → integer kobo, more than zero. */
export const nairaSchema = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const kobo = parseNaira(value)
  if (kobo === null) {
    ctx.addIssue({ code: 'custom', message: `Enter an amount in naira, up to ${formatNaira(MAX_AMOUNT_KOBO)}` })
    return z.NEVER
  }
  if (kobo === 0) {
    ctx.addIssue({ code: 'custom', message: 'Enter an amount more than ₦0' })
    return z.NEVER
  }
  return kobo
})

/** PUT /api/fees/items: one class level's items for a term (replaces them). */
export const feeItemsSchema = z.object({
  termId: id(),
  classLevelId: id(),
  items: z.array(z.object({
    name: z.string().trim().min(2, 'Enter the item name').max(60, 'Use at most 60 characters'),
    amount: nairaSchema,
    optional: z.boolean().default(false),
  }).transform(({ amount, ...item }) => ({ name: item.name, amountKobo: amount, optional: item.optional }))).max(30)
    .refine(items => new Set(items.map(i => i.name.toLowerCase())).size === items.length, 'Each item name can only be used once'),
})

export const copyFeeItemsSchema = z.object({ fromTermId: id(), toTermId: id() })

/** Generate or refresh bills for the term: the whole school, or one arm. */
export const billsActionSchema = z.object({ termId: id(), classArmId: id().optional() })

export const billsQuerySchema = z.object({
  termId: id().optional(),
  classArmId: id().optional(),
  search: z.string().trim().max(60).optional().transform(v => v || undefined),
  page: z.coerce.number().int().min(1).default(1),
})

export const optionalItemsSchema = z.object({ feeItemIds: z.array(id()).max(30) })

const reason = z.string().trim().min(2, 'Give a reason').max(200, 'Use at most 200 characters')

/** A fixed (₦) or percent discount → `{ kind, value }` in kobo or basis points. */
export const discountSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fixed'), amount: nairaSchema, reason }).transform(d => ({ kind: d.kind, value: d.amount, reason: d.reason })),
  z.object({
    kind: z.literal('percent'),
    percent: z.number().gt(0, 'Enter a percentage above 0').max(100, 'Use at most 100%'),
    reason,
  }).transform(d => ({ kind: d.kind, value: Math.round(d.percent * 100), reason: d.reason })),
])

export const paymentSchema = z.object({
  billId: id(),
  amount: nairaSchema,
  method: z.enum(PAYMENT_METHODS, 'Choose cash, bank transfer or POS'),
  paidOn: isoDateSchema,
  reference: z.string().trim().max(60, 'Use at most 60 characters').nullable().optional().transform(v => v || null),
}).transform(({ amount, ...payment }) => ({ billId: payment.billId, amountKobo: amount, method: payment.method, paidOn: payment.paidOn, reference: payment.reference }))

export const reverseSchema = z.object({
  reason: z.string().trim().min(3, 'Say why the payment is being reversed').max(300, 'Use at most 300 characters'),
})

export const feeTermQuerySchema = z.object({ termId: id().optional(), classArmId: id().optional() })

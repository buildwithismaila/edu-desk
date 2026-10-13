import { z } from 'zod'

/** Parent portal (Phase 9): a child's term views default to the current term. */
export const childTermQuerySchema = z.object({ termId: z.uuid().optional() })

export const childPaymentParamsSchema = z.object({ id: z.uuid('Invalid id'), paymentId: z.uuid('Invalid id') })

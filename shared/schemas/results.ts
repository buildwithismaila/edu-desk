import { z } from 'zod'

const id = () => z.uuid('Invalid id')

/** An arm's results for a term (the term defaults to the current one). */
export const resultsQuerySchema = z.object({ termId: id().optional(), classArmId: id() })

/** Submit, publish, unpublish. */
export const resultsActionSchema = z.object({ termId: id(), classArmId: id() })

/** Return to draft needs a reason the class teacher will see. */
export const returnResultsSchema = resultsActionSchema.extend({
  reason: z.string().trim().min(3, 'Say why the results are being returned').max(500, 'Use at most 500 characters'),
})

export const principalCommentsSchema = resultsActionSchema.extend({
  comments: z.array(z.object({
    studentId: id(),
    comment: z.string().trim().max(500, 'Use at most 500 characters').nullable().transform(v => v || null),
  })).min(1).max(300)
    .refine(list => new Set(list.map(c => c.studentId)).size === list.length, 'Each student can only be sent once'),
})

/** All the arm's report cards, or one student's. */
export const reportCardsQuerySchema = resultsQuerySchema.extend({ studentId: id().optional() })

export const studentReportCardQuerySchema = z.object({ termId: id().optional() })

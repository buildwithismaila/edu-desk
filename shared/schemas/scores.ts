import { z } from 'zod'
import { NURSERY_RATING_VALUES, TRAIT_KEYS } from '../constants/traits'

const id = (message = 'Invalid id') => z.uuid(message)

/** A cell value sent to the API: a whole number (range checked per component on the server), ABS, or null to clear. */
const scoreValueSchema = z.union([z.number().int('Use whole numbers'), z.literal('ABS'), z.null()])

/** PUT /api/scores/sheet: only changed cells. Numeric sections send `entries`, Nursery sends `ratings`. */
export const saveSheetSchema = z.object({
  termId: id(),
  classArmId: id(),
  subjectId: id(),
  entries: z.array(z.object({ studentId: id(), componentId: id(), value: scoreValueSchema })).max(3000).default([])
    .refine(list => new Set(list.map(e => `${e.studentId}:${e.componentId}`)).size === list.length, 'Each cell can only be sent once'),
  ratings: z.array(z.object({ studentId: id(), rating: z.enum(NURSERY_RATING_VALUES).nullable() })).max(300).default([])
    .refine(list => new Set(list.map(r => r.studentId)).size === list.length, 'Each student can only be sent once'),
}).refine(body => body.entries.length > 0 || body.ratings.length > 0, 'Nothing to save')

export const sheetQuerySchema = z.object({
  termId: id().optional(),
  classArmId: id(),
  subjectId: id(),
})

export const ratingsQuerySchema = z.object({
  termId: id().optional(),
  classArmId: id(),
})

/** PUT /api/ratings/sheet: traits 1–5 (null clears) and the class teacher's comment ('' clears). */
export const saveRatingsSchema = z.object({
  termId: id(),
  classArmId: id(),
  students: z.array(z.object({
    studentId: id(),
    ratings: z.partialRecord(z.enum(TRAIT_KEYS), z.number().int().min(1, 'Rate from 1 to 5').max(5, 'Rate from 1 to 5').nullable()),
    comment: z.string().trim().max(500, 'Use at most 500 characters').nullable().transform(v => v || null),
  })).min(1).max(300)
    .refine(list => new Set(list.map(s => s.studentId)).size === list.length, 'Each student can only be sent once'),
})

export const scoreLockSchema = z.object({ termId: id(), classArmId: id() })

export type SaveSheetInput = z.input<typeof saveSheetSchema>
export type SaveRatingsInput = z.input<typeof saveRatingsSchema>

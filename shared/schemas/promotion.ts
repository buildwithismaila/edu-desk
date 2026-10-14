import { z } from 'zod'
import { PROMOTION_OUTCOMES } from '../utils/promotion'

export const promotionArmParamsSchema = z.object({ armId: z.uuid('Invalid id') })

/** Every active student of the arm with an outcome; promoted and repeating students need a target arm. */
export const promoteArmSchema = z.object({
  toSessionId: z.uuid('Choose the next session'),
  students: z.array(z.object({
    studentId: z.uuid(),
    outcome: z.enum(PROMOTION_OUTCOMES),
    toClassArmId: z.uuid().nullish(),
  })).max(500),
})
export type PromoteArmInput = z.input<typeof promoteArmSchema>

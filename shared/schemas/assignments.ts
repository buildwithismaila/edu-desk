import { z } from 'zod'

/** Optional session; the server defaults to the current one. */
export const sessionQuerySchema = z.object({ sessionId: z.uuid().optional() })

export const classTeacherSchema = z.object({
  sessionId: z.uuid().optional(),
  /** null clears the arm's class teacher */
  userId: z.uuid('Choose a teacher').nullable(),
})

export const subjectTeachersSchema = z.object({
  sessionId: z.uuid().optional(),
  /** Only the listed subjects change; userId null clears a subject's teacher. */
  assignments: z.array(z.object({
    subjectId: z.uuid(),
    userId: z.uuid().nullable(),
  })).min(1, 'Choose at least one subject'),
}).refine(({ assignments }) => new Set(assignments.map(a => a.subjectId)).size === assignments.length, {
  path: ['assignments'],
  message: 'Each subject can only appear once',
})

export type SubjectTeachersInput = z.input<typeof subjectTeachersSchema>

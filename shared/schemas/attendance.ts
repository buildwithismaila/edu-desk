import { z } from 'zod'
import { isoDateSchema } from './academics'

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late'] as const
export type AttendanceStatus = typeof ATTENDANCE_STATUSES[number]

/** PUT /api/attendance/register: one mark per student; completeness is checked on the server. */
export const saveRegisterSchema = z.object({
  classArmId: z.uuid('Choose a class'),
  date: isoDateSchema,
  marks: z.array(z.object({
    studentId: z.uuid('Invalid student'),
    status: z.enum(ATTENDANCE_STATUSES, 'Use present, absent or late'),
  })).min(1, 'Mark at least one student').max(300)
    .refine(marks => new Set(marks.map(m => m.studentId)).size === marks.length, 'Each student can only be marked once'),
  /** Taken offline on a phone (Phase 10c): the version of the school's register it saw, or null if none */
  offline: z.strictObject({ baseVersion: z.number().int().min(1).nullable() }).optional(),
})

/** GET /api/attendance/register: the date defaults to today (Africa/Lagos). */
export const registerQuerySchema = z.object({
  classArmId: z.uuid('Choose a class'),
  date: isoDateSchema.optional(),
})

/** GET /api/attendance/summary: the term defaults to the current one. */
export const summaryQuerySchema = z.object({
  classArmId: z.uuid('Choose a class'),
  termId: z.uuid().optional(),
})

/** GET /api/students/[id]/attendance */
export const studentAttendanceQuerySchema = z.object({ termId: z.uuid().optional() })

export type SaveRegisterInput = z.input<typeof saveRegisterSchema>

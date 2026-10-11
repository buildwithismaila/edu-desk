import { createError, getRouterParams, type H3Event, readBody } from 'h3'
import { z } from 'zod'

/** Reads the JSON body and validates it; 400 with `data.fieldErrors` (per-field messages) if invalid. */
export async function validateBody<T extends z.ZodType>(event: H3Event, schema: T): Promise<z.output<T>> {
  const result = schema.safeParse(await readBody(event))
  if (!result.success) throw validationError(result.error)
  return result.data
}

/** Validates route params; 400 with `data.fieldErrors` if invalid. */
export function validateParams<T extends z.ZodType>(event: H3Event, schema: T): z.output<T> {
  const result = schema.safeParse(getRouterParams(event))
  if (!result.success) throw validationError(result.error)
  return result.data
}

/** 400 with per-field messages, e.g. for a check that needs the DB (wrong current password). */
export function fieldError(field: string, message: string) {
  return createError({ statusCode: 400, statusMessage: 'Validation Error', data: { fieldErrors: { [field]: [message] } } })
}

function validationError(error: z.ZodError) {
  return createError({ statusCode: 400, statusMessage: 'Validation Error', data: { fieldErrors: z.flattenError(error).fieldErrors } })
}

/** Route params `{ id }` as a uuid. */
export const idParamsSchema = z.object({ id: z.uuid('Invalid id') })

/** Validates an already-assembled value (e.g. a patch merged with the saved row); 400 if invalid. */
export function assertValid<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value)
  if (!result.success) throw validationError(result.error)
  return result.data
}

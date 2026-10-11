import { createError, type H3Event, readBody } from 'h3'
import { z } from 'zod'

/** Reads the JSON body and validates it; 400 with `data.fieldErrors` (per-field messages) if invalid. */
export async function validateBody<T extends z.ZodType>(event: H3Event, schema: T): Promise<z.output<T>> {
  const result = schema.safeParse(await readBody(event))
  if (!result.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation Error',
      data: { fieldErrors: z.flattenError(result.error).fieldErrors },
    })
  }
  return result.data
}

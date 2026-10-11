import { createError } from 'h3'

/** 404 with a user-facing message. Also used for other schools' records, so their existence isn't revealed. */
export function notFound(message = 'Not found') {
  return createError({ statusCode: 404, statusMessage: 'Not Found', message })
}

/** 409: the request conflicts with existing data (duplicate name, record in use, …). */
export function conflict(message: string) {
  return createError({ statusCode: 409, statusMessage: 'Conflict', message })
}

/** True for a Postgres unique violation (23505), whether raised directly or wrapped by Drizzle. */
export function isUniqueViolation(error: unknown): boolean {
  for (let e = error as { code?: string, cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (e.code === '23505') return true
  }
  return false
}

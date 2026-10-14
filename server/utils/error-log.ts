/** Where an error happened; only the route, never query strings or bodies (they can hold personal data). */
export interface ErrorContext {
  method: string | null
  path: string | null
  school: string | null
}

/**
 * One JSON log line for a server fault (status 500+), or null for client errors (4xx), which are expected.
 * `docker compose logs app` shows these (docs/deploy.md).
 */
export function errorLogLine(error: Error & { statusCode?: number }, context: ErrorContext | undefined, now = new Date()): string | null {
  const status = error.statusCode ?? 500
  if (status < 500) return null
  return JSON.stringify({
    level: 'error',
    time: now.toISOString(),
    method: context?.method ?? null,
    path: context?.path?.split('?')[0] ?? null,
    school: context?.school ?? null,
    status,
    message: error.message,
    stack: error.stack,
  })
}

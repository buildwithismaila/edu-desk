import type { FormError } from '@nuxt/ui'

interface ApiErrorData {
  message?: string
  data?: { fieldErrors?: Record<string, string[] | undefined> }
}

const dataOf = (error: unknown) => (error as { data?: ApiErrorData } | undefined)?.data

/** The user-facing message from a failed $fetch to our API. */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  return dataOf(error)?.message || fallback
}

/** Server field errors (400 from validateBody/fieldError) in UForm's setErrors() format. */
export function apiFormErrors(error: unknown): FormError[] {
  const fieldErrors = dataOf(error)?.data?.fieldErrors ?? {}
  return Object.entries(fieldErrors).flatMap(([name, messages]) => (messages ?? []).map(message => ({ name, message })))
}

/**
 * True when a request failed without reaching the server (no signal, DNS, timeout), not because the server
 * refused it. Looks through Nuxt's error wrapping (useFetch's `error` keeps the FetchError as its cause).
 */
export function isNetworkError(error: unknown): boolean {
  const e = error as { name?: string, response?: unknown, cause?: unknown } | null | undefined
  if (!e || typeof e !== 'object') return false
  if (e.name === 'FetchError' && !e.response) return true
  return e.cause !== undefined && e.cause !== e ? isNetworkError(e.cause) : false
}

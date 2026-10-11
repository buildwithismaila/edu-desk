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

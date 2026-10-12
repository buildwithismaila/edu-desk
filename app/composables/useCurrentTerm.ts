/** The school's current session and term (`GET /api/academic/current`), shared via the `current-term` key. */
export function useCurrentTerm() {
  return useFetch('/api/academic/current', { key: 'current-term' })
}

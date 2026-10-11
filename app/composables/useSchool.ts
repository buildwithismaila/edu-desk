/** The current school's public identity (`GET /api/school`), fetched once and shared via the `school` key. */
export function useSchool() {
  return useFetch('/api/school', { key: 'school' })
}

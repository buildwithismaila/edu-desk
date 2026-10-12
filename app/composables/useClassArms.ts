import type { Section } from '#shared/constants/academics'

/** The school's class levels and arms (`GET /api/class-levels`) as select items, shared via the `class-levels` key.
 * Not awaited, so dialogs opened with useOverlay (no Suspense) can use it. */
export function useClassArms() {
  const { data: levels } = useFetch('/api/class-levels', { key: 'class-levels', default: () => [] })

  const armItems = computed(() => levels.value.flatMap(level => level.arms.map(arm => ({ label: arm.label, value: arm.id }))))
  const sectionOfArm = computed(() => new Map<string, Section>(levels.value.flatMap(level => level.arms.map(arm => [arm.id, level.section] as const))))

  return { levels, armItems, sectionOfArm }
}

/** Nigeria's 36 states and the Federal Capital Territory, alphabetical (docs/domain.md: state of origin). */
export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta',
  'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi',
  'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
  'Taraba', 'Yobe', 'Zamfara',
] as const

export type NigerianState = typeof NIGERIAN_STATES[number]

const key = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, ' ')
const byKey = new Map<string, NigerianState>(NIGERIAN_STATES.map(state => [key(state), state]))
byKey.set('abuja', 'FCT')
byKey.set('federal capital territory', 'FCT')

/** "lagos", "AKWA-IBOM", "Abuja" → the canonical name; null if it isn't a state. */
export function normaliseState(value: string): NigerianState | null {
  return byKey.get(key(value)) ?? null
}

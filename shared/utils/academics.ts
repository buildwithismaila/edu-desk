/**
 * "JSS 1" + "A" → "JSS 1A"; "JSS 1" + "Gold" → "JSS 1 Gold"; "Creche" + "A" → "Creche A".
 * A single-letter arm joins only a level name that ends in a number.
 */
export function classArmLabel(levelName: string, armName: string) {
  return /\d$/.test(levelName) && /^\p{L}$/u.test(armName) ? `${levelName}${armName}` : `${levelName} ${armName}`
}

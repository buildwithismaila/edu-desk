/** "JSS 1" + "A" → "JSS 1A"; "JSS 1" + "Gold" → "JSS 1 Gold" (only a single letter joins). */
export function classArmLabel(levelName: string, armName: string) {
  return /^\p{L}$/u.test(armName) ? `${levelName}${armName}` : `${levelName} ${armName}`
}

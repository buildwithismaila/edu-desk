import { z } from 'zod'

/** `GFA` + 2026 + 1 → `GFA/2026/0001` (docs/domain.md). The sequence grows past 4 digits when needed. */
export function formatAdmissionNumber(prefix: string, year: number, seq: number) {
  return `${prefix}/${year}/${String(seq).padStart(4, '0')}`
}

/**
 * A starting prefix from the school name: initials of up to 4 words ("Greenfield Academy" → GA),
 * or the first 3 letters of a one-word name (Sunrise → SUN); SCH if there are no letters.
 */
export function defaultAdmissionPrefix(schoolName: string) {
  const words = schoolName.split(/\s+/).map(w => w.replace(/[^a-z]/gi, '')).filter(Boolean)
  if (words.length === 0) return 'SCH'
  if (words.length === 1) return words[0]!.slice(0, 3).toUpperCase()
  return words.slice(0, 4).map(w => w[0]).join('').toUpperCase()
}

export const admissionPrefixSchema = z.string().trim().toUpperCase()
  .regex(/^[A-Z0-9]{2,6}$/, 'Use 2–6 letters or digits, e.g. GFA')

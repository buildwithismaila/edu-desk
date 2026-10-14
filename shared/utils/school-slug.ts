import { RESERVED_SLUGS, SLUG_PATTERN } from '../constants/tenant'

/** Why a school slug (its subdomain) can't be used, or null if it can. Existence is checked separately. */
export function schoolSlugError(slug: string): string | null {
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) return `"${slug}" is reserved. Choose another name.`
  if (!SLUG_PATTERN.test(slug)) return 'Use 3–40 lowercase letters, digits or hyphens (not at the start or end), e.g. greenfield'
  return null
}

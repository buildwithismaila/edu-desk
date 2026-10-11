/** A same-site path to return to after login; anything else (absolute or protocol-relative URLs) → `/`. */
export function safeRedirect(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/'
  return value
}

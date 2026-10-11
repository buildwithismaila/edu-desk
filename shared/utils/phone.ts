/**
 * Nigerian phone number → `+234XXXXXXXXXX` (docs/domain.md), or null if it isn't one.
 * Accepts `0XXXXXXXXXX`, `+234XXXXXXXXXX` or `234XXXXXXXXXX`, with spaces or hyphens.
 */
export function normalisePhone(input: string): string | null {
  const compact = input.replace(/[\s-]/g, '')
  const match = /^(?:\+?234|0)(\d{10})$/.exec(compact)
  return match ? `+234${match[1]}` : null
}

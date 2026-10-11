import { describe, expect, it } from 'vitest'
import { safeRedirect } from '~~/shared/utils/redirect'

describe('safeRedirect', () => {
  it.each(['/', '/users', '/account/password?x=1'])('keeps the path %s', (path) => {
    expect(safeRedirect(path)).toBe(path)
  })

  it.each([
    ['an absolute URL', 'https://evil.example/login'],
    ['a protocol-relative URL', '//evil.example'],
    ['a backslash trick', '/\\evil.example'],
    ['a relative path', 'users'],
    ['an empty string', ''],
    ['a non-string', ['/users']],
    ['nothing', undefined],
  ])('falls back to / for %s', (_case, value) => {
    expect(safeRedirect(value)).toBe('/')
  })
})

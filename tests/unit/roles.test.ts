import { describe, expect, it } from 'vitest'
import { hasRole, ROLE_LABELS, ROLES } from '~~/shared/constants/roles'

describe('roles', () => {
  it('has the five school roles from docs/domain.md', () => {
    expect(ROLES).toEqual(['admin', 'principal', 'bursar', 'teacher', 'parent'])
  })

  it('labels every role', () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...ROLES].sort())
  })

  it.each([
    ['admin', ['admin'], true],
    ['teacher', ['admin', 'principal'], false],
    ['bursar', ['admin', 'bursar'], true],
    ['parent', [], false],
  ] as const)('hasRole(%s, %j) is %s', (role, roles, expected) => {
    expect(hasRole({ role }, roles)).toBe(expected)
  })
})

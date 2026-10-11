import { describe, expect, it } from 'vitest'
import { ROLES } from '#shared/constants/roles'
import { navigationFor } from '~/utils/navigation'

describe('navigationFor', () => {
  it('gives the admin the Dashboard and Users', () => {
    expect(navigationFor('admin').map(i => i.label)).toEqual(['Dashboard', 'Users'])
  })

  it.each(ROLES.filter(r => r !== 'admin'))('gives %s only the Dashboard', (role) => {
    expect(navigationFor(role).map(i => i.label)).toEqual(['Dashboard'])
  })

  it('does not leak the roles list into menu items', () => {
    expect(navigationFor('admin').every(i => !('roles' in i))).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { ROLES } from '#shared/constants/roles'
import { navigationFor } from '~/utils/navigation'

describe('navigationFor', () => {
  it('gives the admin the Dashboard, Users and the School setup group', () => {
    const items = navigationFor('admin')

    expect(items.map(i => i.label)).toEqual(['Dashboard', 'Users', 'School setup'])
    expect(items[2]!.children!.map(i => i.to)).toEqual([
      '/settings/school', '/settings/calendar', '/settings/classes', '/settings/subjects', '/settings/grading',
    ])
  })

  it.each(ROLES.filter(r => r !== 'admin'))('gives %s only the Dashboard', (role) => {
    expect(navigationFor(role).map(i => i.label)).toEqual(['Dashboard'])
  })

  it('does not leak the roles list into menu items', () => {
    const all = navigationFor('admin').flatMap(i => [i, ...(i.children ?? [])])
    expect(all.every(i => !('roles' in i))).toBe(true)
  })
})

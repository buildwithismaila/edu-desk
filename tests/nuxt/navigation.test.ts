import { describe, expect, it } from 'vitest'
import { navigationFor } from '~/utils/navigation'

describe('navigationFor', () => {
  it('gives the admin Staff, Assignments and the School setup group', () => {
    const items = navigationFor('admin')

    expect(items.map(i => i.label)).toEqual(['Dashboard', 'Staff', 'Assignments', 'School setup'])
    expect(items[3]!.children!.map(i => i.to)).toEqual([
      '/settings/school', '/settings/calendar', '/settings/classes', '/settings/subjects', '/settings/grading',
    ])
  })

  it('gives the principal Staff and Assignments, but not School setup', () => {
    expect(navigationFor('principal').map(i => i.label)).toEqual(['Dashboard', 'Staff', 'Assignments'])
  })

  it.each(['bursar', 'teacher', 'parent'] as const)('gives %s only the Dashboard', (role) => {
    expect(navigationFor(role).map(i => i.label)).toEqual(['Dashboard'])
  })

  it('does not leak the roles list into menu items', () => {
    const all = navigationFor('admin').flatMap(i => [i, ...(i.children ?? [])])
    expect(all.every(i => !('roles' in i))).toBe(true)
  })
})

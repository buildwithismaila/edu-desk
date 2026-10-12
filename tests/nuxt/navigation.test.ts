import { describe, expect, it } from 'vitest'
import { navigationFor } from '~/utils/navigation'

describe('navigationFor', () => {
  it('gives the admin Students, Attendance, Staff, Assignments and the School setup group', () => {
    const items = navigationFor('admin')

    expect(items.map(i => i.label)).toEqual(['Dashboard', 'Students', 'Attendance', 'Staff', 'Assignments', 'School setup'])
    expect(items[5]!.children!.map(i => i.to)).toEqual([
      '/settings/school', '/settings/calendar', '/settings/classes', '/settings/subjects', '/settings/grading',
    ])
  })

  it('gives the principal Students, Attendance, Staff and Assignments, but not School setup', () => {
    expect(navigationFor('principal').map(i => i.label)).toEqual(['Dashboard', 'Students', 'Attendance', 'Staff', 'Assignments'])
  })

  it('gives the teacher Students and Attendance', () => {
    expect(navigationFor('teacher').map(i => i.label)).toEqual(['Dashboard', 'Students', 'Attendance'])
  })

  it('gives the bursar the Dashboard and Students, not Attendance', () => {
    expect(navigationFor('bursar').map(i => i.label)).toEqual(['Dashboard', 'Students'])
  })

  it('gives the parent only the Dashboard', () => {
    expect(navigationFor('parent').map(i => i.label)).toEqual(['Dashboard'])
  })

  it('does not leak the roles list into menu items', () => {
    const all = navigationFor('admin').flatMap(i => [i, ...(i.children ?? [])])
    expect(all.every(i => !('roles' in i))).toBe(true)
  })
})

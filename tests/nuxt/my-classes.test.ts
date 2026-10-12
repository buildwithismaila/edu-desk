import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import MyClasses from '~/components/dashboard/MyClasses.vue'

let mine: unknown
registerEndpoint('/api/me/assignments', () => mine)
registerEndpoint('/api/attendance/arms', () => ({ today: '2026-10-12', arms: [{ id: 'a1', label: 'JSS 1A', students: 10, taken: true }] }))

afterEach(() => {
  clearNuxtData()
})

describe('MyClasses', () => {
  it('lists the arms I am class teacher of and the subjects I teach', async () => {
    mine = {
      session: { id: 's1', name: '2026/2027' },
      classTeacherOf: [{ classArmId: 'a1', label: 'JSS 1A' }],
      subjects: [
        { subjectId: 'm', name: 'Mathematics', classArmId: 'a1', label: 'JSS 1A' },
        { subjectId: 'm', name: 'Mathematics', classArmId: 'a2', label: 'JSS 1B' },
      ],
    }

    const wrapper = await mountSuspended(MyClasses)

    expect(wrapper.text()).toContain('My classes · 2026/2027')
    expect(wrapper.find('[data-testid="my-class-teacher-JSS 1A"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="my-subject-Mathematics-JSS 1B"]').text()).toBe('Mathematics — JSS 1B')
  })

  it('shows whether today\'s register is taken for my class-teacher arms', async () => {
    mine = {
      session: { id: 's1', name: '2026/2027' },
      classTeacherOf: [{ classArmId: 'a1', label: 'JSS 1A' }, { classArmId: 'a2', label: 'JSS 1B' }],
      subjects: [],
    }

    const wrapper = await mountSuspended(MyClasses)

    expect(wrapper.get('[data-testid="my-register-JSS 1A"]').text()).toBe('Register taken today')
    expect(wrapper.get('[data-testid="my-register-JSS 1B"]').text()).toBe('Register not taken today')
    expect(wrapper.find('a[href="/attendance?arm=a2"]').text()).toBe('Take register')
  })

  it('says when nothing is assigned', async () => {
    mine = { session: { id: 's1', name: '2026/2027' }, classTeacherOf: [], subjects: [] }

    const wrapper = await mountSuspended(MyClasses)

    expect(wrapper.get('[data-testid=my-classes-empty]').text()).toBe('No classes assigned to you for 2026/2027.')
  })
})

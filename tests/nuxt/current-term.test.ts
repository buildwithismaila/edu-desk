import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import CurrentTerm from '~/components/layout/CurrentTerm.vue'

let current: unknown = { session: null, term: null }
registerEndpoint('/api/academic/current', () => current)
registerEndpoint('/api/_auth/session', () => ({}))

function logInAs(role: 'admin' | 'teacher') {
  useUserSession().session.value = { id: 'session-1', user: { id: 'u1', name: 'Ada Obi', role, mustChangePassword: false } }
}

afterEach(() => {
  clearNuxtData('current-term')
  useUserSession().session.value = null
})

describe('CurrentTerm', () => {
  it('shows the current session and term', async () => {
    current = {
      session: { id: 's1', name: '2026/2027' },
      term: { id: 't1', number: 'first', startsOn: '2026-09-14', endsOn: '2026-12-18', nextTermBeginsOn: null },
    }
    logInAs('teacher')

    const wrapper = await mountSuspended(CurrentTerm)

    expect(wrapper.get('[data-testid=current-term]').text()).toBe('2026/2027 · First Term')
  })

  it('tells a teacher there is no current term', async () => {
    current = { session: null, term: null }
    logInAs('teacher')

    const wrapper = await mountSuspended(CurrentTerm)

    expect(wrapper.get('[data-testid=current-term]').text()).toBe('No current term')
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('links an admin to the calendar when there is no current term', async () => {
    current = { session: null, term: null }
    logInAs('admin')

    const wrapper = await mountSuspended(CurrentTerm)

    expect(wrapper.get('a').attributes('href')).toBe('/settings/calendar')
  })
})

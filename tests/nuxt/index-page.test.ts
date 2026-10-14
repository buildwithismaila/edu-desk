import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import IndexPage from '~/pages/index.vue'

registerEndpoint('/api/school', () => ({ slug: 'sunrise', name: 'Sunrise Schools' }))
registerEndpoint('/api/_auth/session', () => ({}))
registerEndpoint('/api/dashboard', () => ({ term: null, students: null, attendance: null, fees: null, results: null }))
registerEndpoint('/api/me/assignments', () => ({ session: null, classTeacherOf: [], subjects: [] }))

afterEach(() => {
  useUserSession().session.value = null
})

describe('index page', () => {
  it('welcomes the user to the current school with their name and role', async () => {
    useUserSession().session.value = { id: 'session-1', user: { id: 'u1', name: 'Bola Ogunleye', role: 'admin', mustChangePassword: false } }

    const wrapper = await mountSuspended(IndexPage)

    expect(wrapper.get('h1').text()).toBe('Welcome to Sunrise Schools')
    expect(wrapper.get('[data-testid=current-user]').text()).toBe('Bola Ogunleye · Admin / Proprietor')
  })
})

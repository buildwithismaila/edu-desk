import { h } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { Role } from '#shared/constants/roles'
import AuthLayout from '~/layouts/auth.vue'
import DefaultLayout from '~/layouts/default.vue'
import PrintLayout from '~/layouts/print.vue'

registerEndpoint('/api/school', () => ({ slug: 'greenfield', name: 'Greenfield Academy' }))
registerEndpoint('/api/_auth/session', () => ({}))
registerEndpoint('/api/academic/current', () => ({ session: null, term: null }))

const slots = { default: () => h('p', { 'data-testid': 'slot' }, 'Page content') }

function logInAs(role: Role, name = 'Ada Obi') {
  useUserSession().session.value = { id: 'session-1', user: { id: 'u1', name, role, mustChangePassword: false } }
}

afterEach(() => {
  useUserSession().session.value = null
})

describe('default layout', () => {
  it('renders the sidebar with the school name, the toggles and the page', async () => {
    logInAs('admin')
    const wrapper = await mountSuspended(DefaultLayout, { slots })

    expect(wrapper.find('[data-testid=sidebar]').exists()).toBe(true)
    expect(wrapper.get('[data-testid=school-name]').text()).toBe('Greenfield Academy')
    expect(wrapper.find('[data-testid=sidebar-toggle]').exists()).toBe(true)
    expect(wrapper.find('[data-testid=sidebar-collapse]').exists()).toBe(true)
    expect(wrapper.get('[data-testid=slot]').text()).toBe('Page content')
  })

  it('shows the admin the Users link', async () => {
    logInAs('admin')
    const wrapper = await mountSuspended(DefaultLayout, { slots })

    const nav = wrapper.get('[data-testid=sidebar] nav').text()
    expect(nav).toContain('Dashboard')
    expect(nav).toContain('Users')
  })

  it('hides the Users link from a teacher', async () => {
    logInAs('teacher')
    const wrapper = await mountSuspended(DefaultLayout, { slots })

    const nav = wrapper.get('[data-testid=sidebar] nav').text()
    expect(nav).toContain('Dashboard')
    expect(nav).not.toContain('Users')
  })

  it('shows the user menu with the user\'s name', async () => {
    logInAs('bursar', 'Fatima Bello')
    const wrapper = await mountSuspended(DefaultLayout, { slots })

    expect(wrapper.get('[data-testid=user-menu]').text()).toContain('Fatima Bello')
  })
})

describe('other layouts', () => {
  it('auth layout renders the page', async () => {
    const wrapper = await mountSuspended(AuthLayout, { slots })
    expect(wrapper.get('[data-testid=slot]').text()).toBe('Page content')
  })

  it('print layout renders the page', async () => {
    const wrapper = await mountSuspended(PrintLayout, { slots })
    expect(wrapper.get('[data-testid=slot]').text()).toBe('Page content')
  })
})

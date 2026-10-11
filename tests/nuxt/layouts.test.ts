import { h } from 'vue'
import { describe, expect, it } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import AuthLayout from '~/layouts/auth.vue'
import DefaultLayout from '~/layouts/default.vue'
import PrintLayout from '~/layouts/print.vue'

registerEndpoint('/api/school', () => ({ slug: 'greenfield', name: 'Greenfield Academy' }))

const slots = { default: () => h('p', { 'data-testid': 'slot' }, 'Page content') }

describe('layouts', () => {
  it('default layout renders the sidebar with the school name, the toggles and the page', async () => {
    const wrapper = await mountSuspended(DefaultLayout, { slots })
    expect(wrapper.find('[data-testid=sidebar]').exists()).toBe(true)
    expect(wrapper.get('[data-testid=school-name]').text()).toBe('Greenfield Academy')
    expect(wrapper.find('[data-testid=sidebar-toggle]').exists()).toBe(true)
    expect(wrapper.find('[data-testid=sidebar-collapse]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Dashboard')
    expect(wrapper.get('[data-testid=slot]').text()).toBe('Page content')
  })

  it('auth layout renders the page', async () => {
    const wrapper = await mountSuspended(AuthLayout, { slots })
    expect(wrapper.get('[data-testid=slot]').text()).toBe('Page content')
  })

  it('print layout renders the page', async () => {
    const wrapper = await mountSuspended(PrintLayout, { slots })
    expect(wrapper.get('[data-testid=slot]').text()).toBe('Page content')
  })
})

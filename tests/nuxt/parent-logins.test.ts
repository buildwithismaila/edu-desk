import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import ParentLoginsPage from '~/pages/parent-logins/index.vue'
import SlipsPage from '~/pages/parent-logins/slips.vue'

const parent = (n: number, status: string, extra = {}) => ({
  id: `p${n}`, name: `Parent ${n}`, phone: `+23480311100${n}0`, email: null, status, lastLoginAt: null,
  children: [{ name: `Child ${n}`, classLabel: 'JSS 1A' }], ...extra,
})
registerEndpoint('/api/_auth/session', () => ({}))
registerEndpoint('/api/school', () => ({ slug: 'greenfield', name: 'Greenfield Academy', logoUrl: null }))
registerEndpoint('/api/class-levels', () => [{ id: 'l1', section: 'jss', name: 'JSS 1', sortOrder: 0, arms: [{ id: 'a1', classLevelId: 'l1', name: 'A', label: 'JSS 1A' }] }])
registerEndpoint('/api/parent-logins', () => ({
  items: [parent(1, 'none'), parent(2, 'issued'), parent(3, 'active', { lastLoginAt: '2026-10-14T08:00:00Z', children: [] })],
  total: 3, page: 1, pageSize: 50,
}))

// The auth middleware runs on the mounted route: be a logged-in admin
beforeEach(() => {
  useUserSession().session.value = { id: 'session-1', user: { id: 'u1', name: 'Admin', role: 'admin', mustChangePassword: false } }
})
afterEach(() => {
  useUserSession().session.value = null
  useState('parent-login-slips').value = null
  clearNuxtData()
})

describe('Parent logins page', () => {
  it('lists parents with children and a status each', async () => {
    const wrapper = await mountSuspended(ParentLoginsPage, { route: '/parent-logins' })

    expect(wrapper.findAll('[data-testid=parent-login-status]').map(b => b.text())).toEqual(['No login yet', 'Slip given, not used yet', 'Active'])
    expect(wrapper.get('[data-testid="parent-+2348031110010"]').text()).toContain('Child 1 (JSS 1A)')
    expect(wrapper.get('[data-testid="parent-+2348031110030"]').text()).toContain('No current children')
    expect(wrapper.get('[data-testid="parent-+2348031110030"]').text()).toContain('Last login')
    expect(wrapper.find('[data-testid=generate-all]').exists()).toBe(true)
    expect(wrapper.find('[data-testid=generate-selected]').exists()).toBe(false)
  })

  it('offers new logins for the selected parents', async () => {
    const wrapper = await mountSuspended(ParentLoginsPage, { route: '/parent-logins' })
    await wrapper.get('[aria-label="Select Parent 2"]').trigger('click')
    expect(wrapper.get('[data-testid=generate-selected]').text()).toBe('New logins for 1 selected')
  })
})

describe('Login slips page', () => {
  it('prints 8 slips per page with the school, username and one-time password', async () => {
    useState('parent-login-slips').value = {
      skipped: 0,
      slips: Array.from({ length: 9 }, (_, i) => ({
        guardianId: `g${i}`, name: `Parent ${i}`, phone: `+23480311100${i}0`, email: null,
        children: [{ name: `Child ${i}`, classLabel: 'JSS 1A' }], temporaryPassword: `Pass${i}word23`,
      })),
    }
    const wrapper = await mountSuspended(SlipsPage, { route: '/parent-logins/slips' })

    const slips = wrapper.findAll('[data-testid=login-slip]')
    expect(slips).toHaveLength(9)
    expect(wrapper.findAll('section')).toHaveLength(2)
    expect(slips[0]!.text()).toContain('Greenfield Academy')
    expect(slips[0]!.text()).toContain('Parent 0')
    expect(slips[0]!.text()).toContain('For: Child 0')
    expect(slips[0]!.text()).toContain('+2348031110000')
    expect(slips[0]!.get('[data-testid=slip-password]').text()).toBe('Pass0word23')
  })

  it('says there is nothing to print once the passwords are gone', async () => {
    const wrapper = await mountSuspended(SlipsPage, { route: '/parent-logins/slips' })
    expect(wrapper.get('[data-testid=slips-empty]').text()).toContain('No slips to print')
  })
})

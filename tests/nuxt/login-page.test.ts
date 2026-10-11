import { flushPromises } from '@vue/test-utils'
import { setResponseStatus } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import LoginPage from '~/pages/login.vue'

registerEndpoint('/api/school', () => ({ slug: 'greenfield', name: 'Greenfield Academy' }))
registerEndpoint('/api/_auth/session', () => ({}))
registerEndpoint('/api/auth/login', {
  method: 'POST',
  // The JSON body Nitro sends for a handled 401 (see server/api/auth/login.post.ts)
  handler: (event) => {
    setResponseStatus(event, 401, 'Unauthorized')
    return { error: true, statusCode: 401, statusMessage: 'Unauthorized', message: 'Invalid email or password' }
  },
})

describe('login page', () => {
  it('shows the school name', async () => {
    const wrapper = await mountSuspended(LoginPage)
    expect(wrapper.get('[data-testid=login-school-name]').text()).toBe('Greenfield Academy')
  })

  it('shows field errors when submitted empty, without calling the API', async () => {
    const wrapper = await mountSuspended(LoginPage)

    await wrapper.get('form').trigger('submit')

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Enter a valid email address')
      expect(wrapper.text()).toContain('Enter your password')
    })
    expect(wrapper.find('[data-testid=login-error]').exists()).toBe(false)
  })

  it('shows the API\'s message when login fails', async () => {
    const wrapper = await mountSuspended(LoginPage)

    await wrapper.get('input[data-testid=login-email]').setValue('admin@greenfield.test')
    await wrapper.get('input[data-testid=login-password]').setValue('wrong-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    await vi.waitFor(() => {
      expect(wrapper.get('[data-testid=login-error]').text()).toContain('Invalid email or password')
    })
  })
})

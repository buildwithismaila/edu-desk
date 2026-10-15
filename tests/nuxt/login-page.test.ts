import { flushPromises } from '@vue/test-utils'
import { readBody, setResponseStatus } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import LoginPage from '~/pages/login.vue'

registerEndpoint('/api/school', () => ({ slug: 'greenfield', name: 'Greenfield Academy' }))
registerEndpoint('/api/_auth/session', () => ({}))
let sentBody: unknown
registerEndpoint('/api/auth/login', {
  method: 'POST',
  // The JSON body Nitro sends for a handled 401 (see server/api/auth/login.post.ts)
  handler: async (event) => {
    sentBody = await readBody(event)
    setResponseStatus(event, 401, 'Unauthorized')
    return { error: true, statusCode: 401, statusMessage: 'Unauthorized', message: 'Invalid email, phone or password' }
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
      expect(wrapper.text()).toContain('Enter your email or phone number')
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
      expect(wrapper.get('[data-testid=login-error]').text()).toContain('Invalid email, phone or password')
    })
  })

  it('sends what was typed (the server parses the email or phone itself)', async () => {
    const wrapper = await mountSuspended(LoginPage)

    await wrapper.get('input[data-testid=login-email]').setValue(' 0803 111 0001 ')
    await wrapper.get('input[data-testid=login-password]').setValue('password123')
    await wrapper.get('form').trigger('submit')

    await vi.waitFor(() => expect(sentBody).toEqual({ login: ' 0803 111 0001 ', password: 'password123' }))
  })

  it('links to the privacy notice and terms, and says who resets a forgotten password', async () => {
    const wrapper = await mountSuspended(LoginPage)
    expect(wrapper.text()).toContain('Forgot your password? Ask your school admin to reset it.')
    expect(wrapper.get('[data-testid=legal-links]').findAll('a').map(a => [a.text(), a.attributes('href')])).toEqual([['Privacy', '/privacy'], ['Terms', '/terms']])
  })
})

import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createError } from '#app'
import ErrorPage from '~/error.vue'

function mountError(status: number, statusText: string) {
  return mountSuspended(ErrorPage, { props: { error: createError({ status, statusText }) } })
}

describe('error page', () => {
  it('shows "School not found" for a 404', async () => {
    const wrapper = await mountError(404, 'School not found')
    expect(wrapper.find('[data-testid=error-not-found]').exists()).toBe(true)
  })

  it('shows "School suspended" for a suspended school', async () => {
    const wrapper = await mountError(403, 'School suspended')
    expect(wrapper.find('[data-testid=error-suspended]').exists()).toBe(true)
  })

  it('shows a generic error for any other 403', async () => {
    const wrapper = await mountError(403, 'Forbidden')
    expect(wrapper.find('[data-testid=error-suspended]').exists()).toBe(false)
    expect(wrapper.find('[data-testid=error-generic]').exists()).toBe(true)
  })

  it('shows a generic error for a 500', async () => {
    const wrapper = await mountError(500, 'Server Error')
    expect(wrapper.find('[data-testid=error-generic]').exists()).toBe(true)
  })
})

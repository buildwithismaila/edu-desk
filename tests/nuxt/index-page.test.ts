import { describe, expect, it } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import IndexPage from '~/pages/index.vue'

registerEndpoint('/api/school', () => ({ slug: 'sunrise', name: 'Sunrise Schools' }))

describe('index page', () => {
  it('welcomes the visitor to the current school', async () => {
    const wrapper = await mountSuspended(IndexPage)
    expect(wrapper.get('h1').text()).toBe('Welcome to Sunrise Schools')
  })
})

import { describe, expect, it } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import SchoolBrand from '~/components/layout/SchoolBrand.vue'

registerEndpoint('/api/school', () => ({ slug: 'greenfield', name: 'Greenfield Academy' }))

describe('SchoolBrand', () => {
  it('shows the current school name from /api/school', async () => {
    const wrapper = await mountSuspended(SchoolBrand)
    expect(wrapper.get('[data-testid=school-name]').text()).toBe('Greenfield Academy')
  })

  it('hides the name when the sidebar is collapsed', async () => {
    const wrapper = await mountSuspended(SchoolBrand, { props: { collapsed: true } })
    expect(wrapper.find('[data-testid=school-name]').exists()).toBe(false)
  })
})

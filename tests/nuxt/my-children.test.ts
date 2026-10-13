import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import MyChildren from '~/components/dashboard/MyChildren.vue'

let children: unknown[] = []
registerEndpoint('/api/me/children', () => children)

afterEach(() => {
  clearNuxtData()
})

describe('MyChildren', () => {
  it('shows a card per child with class and admission number', async () => {
    children = [
      { id: 's1', name: 'Chidera Eze', admissionNumber: 'GFA/2026/0001', classLabel: 'JSS 1A', photoUrl: null, reportCard: { termId: 't1', termNumber: 'first' } },
      { id: 's2', name: 'Somto Eze', admissionNumber: 'GFA/2026/0002', classLabel: null, photoUrl: null, reportCard: null },
    ]

    const wrapper = await mountSuspended(MyChildren)

    expect(wrapper.get('[data-testid="my-child-GFA/2026/0001"]').text()).toContain('Chidera EzeJSS 1AGFA/2026/0001')
    expect(wrapper.get('[data-testid="my-child-GFA/2026/0002"]').text()).toContain('No class this session')
    // A report card link only once results are published
    expect(wrapper.get('[data-testid="my-child-report-GFA/2026/0001"]').attributes('href')).toBe('/students/s1/report-card?term=t1')
    expect(wrapper.get('[data-testid="my-child-report-GFA/2026/0001"]').text()).toBe('Report card · First Term')
    expect(wrapper.find('[data-testid="my-child-report-GFA/2026/0002"]').exists()).toBe(false)
  })

  it('says when no child is linked', async () => {
    children = []

    const wrapper = await mountSuspended(MyChildren)

    expect(wrapper.get('[data-testid=my-children-empty]').text()).toContain('No children are linked to your account yet')
  })
})

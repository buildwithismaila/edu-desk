import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import FeesResultHolds from '~/components/fees/FeesResultHolds.vue'

// Results withheld from parents until fees are paid, on the student's Fees page (Phase 10d)

let holds: unknown = { enabled: true, terms: [] }
const calls: string[] = []
registerEndpoint('/api/students/s1/result-holds', () => holds)
registerEndpoint('/api/students/s1/result-release', {
  method: 'PUT',
  handler: () => {
    calls.push('release')
    return { released: true }
  },
})
registerEndpoint('/api/students/s1/result-release', {
  method: 'DELETE',
  handler: () => {
    calls.push('withhold')
    return { released: false }
  },
})

afterEach(() => {
  holds = { enabled: true, terms: [] }
  calls.length = 0
})

const withheld = { termId: 't1', term: 'First Term 2026/2027', owedKobo: 2_500_000, released: null }

describe('FeesResultHolds', () => {
  it('lists the withheld terms with what is owed, and releases one', async () => {
    holds = { enabled: true, terms: [withheld] }
    const wrapper = await mountSuspended(FeesResultHolds, { props: { studentId: 's1' } })

    expect(wrapper.get('[data-testid=result-hold-t1]').text()).toContain('First Term 2026/2027 · owing ₦25,000.00')
    holds = { enabled: true, terms: [{ ...withheld, released: { by: 'Fatima Bello', at: '2026-10-26T10:00:00Z' } }] }
    await wrapper.get('[data-testid=result-hold-toggle-t1]').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('[data-testid=result-hold-t1]').text()).toContain('released by Fatima Bello'))
    expect(calls).toEqual(['release'])
    expect(wrapper.get('[data-testid=result-hold-toggle-t1]').text()).toBe('Withhold again')

    await wrapper.get('[data-testid=result-hold-toggle-t1]').trigger('click')
    await flushPromises()
    expect(calls).toEqual(['release', 'withhold'])
  })

  it('shows nothing when nothing is withheld, or when the school doesn\'t withhold results', async () => {
    expect((await mountSuspended(FeesResultHolds, { props: { studentId: 's1' } })).find('[data-testid=result-holds]').exists()).toBe(false)
    holds = { enabled: false, terms: [] }
    expect((await mountSuspended(FeesResultHolds, { props: { studentId: 's1' } })).find('[data-testid=result-holds]').exists()).toBe(false)
  })
})

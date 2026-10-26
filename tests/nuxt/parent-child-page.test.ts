import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import ChildPage from '~/pages/my-children/[id]/index.vue'

const child = {
  id: 'c1',
  name: 'Somto Eze',
  admissionNumber: 'GFA/2026/0002',
  classLabel: 'Primary 3A',
  photoUrl: null,
  currentTermId: 't1',
  attendanceTerms: [{ id: 't1', label: 'First Term 2026/2027' }],
  feeTerms: [{ id: 't1', label: 'First Term 2026/2027' }],
}
let results: unknown[] = []
let bill: unknown = null

registerEndpoint('/api/me/children/c1', () => child)
registerEndpoint('/api/me/children/c1/results', () => results)
registerEndpoint('/api/me/children/c1/attendance', () => ({
  term: { id: 't1', label: 'First Term 2026/2027' }, opened: 0, present: 0, absent: 0, late: 0, rate: null, absentDates: [], lateDates: [],
}))
registerEndpoint('/api/me/children/c1/fees', () => ({ term: { id: 't1', label: 'First Term 2026/2027' }, bill }))

registerEndpoint('/api/_auth/session', () => ({}))

// The auth middleware runs on the mounted route: be a logged-in parent
beforeEach(() => {
  useUserSession().session.value = { id: 'session-1', user: { id: 'u1', name: 'Ngozi Eze', role: 'parent', mustChangePassword: false } }
})

afterEach(() => {
  useUserSession().session.value = null
  clearNuxtData()
  results = []
  bill = null
})

describe('a parent\'s child page', () => {
  it('shows the child and their published report cards', async () => {
    results = [{ termId: 't1', term: 'First Term 2026/2027', publishedAt: '2026-10-10T10:00:00Z', average: 72.4, position: 3, numberInClass: 8 }]
    const wrapper = await mountSuspended(ChildPage, { route: '/my-children/c1' })

    expect(wrapper.get('[data-testid=child-name]').text()).toBe('Somto Eze')
    const card = wrapper.get('[data-testid=child-result-t1]')
    expect(card.attributes('href')).toBe('/students/c1/report-card?term=t1')
    expect(card.text()).toContain('Average 72.4 · Position 3 of 8')
  })

  it('shows a term withheld until its fees are paid, with what is owed and the way to the fees (Phase 10d)', async () => {
    results = [
      { termId: 't2', term: 'Second Term 2026/2027', publishedAt: '2027-04-01T10:00:00Z', withheld: true, owedKobo: 4_500_000, average: null, position: null, numberInClass: null },
      { termId: 't1', term: 'First Term 2026/2027', publishedAt: '2026-12-10T10:00:00Z', withheld: false, owedKobo: null, average: 72.4, position: 3, numberInClass: 8 },
    ]
    const wrapper = await mountSuspended(ChildPage, { route: '/my-children/c1' })

    const withheld = wrapper.get('[data-testid=child-result-withheld-t2]')
    expect(withheld.text()).toContain('Withheld until fees are paid. Outstanding for this term: ₦45,000.00.')
    expect(withheld.find('a').attributes('href')).toBe('/my-children/c1?tab=fees')
    // No report card link for the withheld term; the paid term opens as usual
    expect(wrapper.find('[data-testid=child-result-t2]').exists()).toBe(false)
    expect(wrapper.get('[data-testid=child-result-t1]').attributes('href')).toBe('/students/c1/report-card?term=t1')
  })

  it('says when no report card is published yet', async () => {
    const wrapper = await mountSuspended(ChildPage, { route: '/my-children/c1' })
    expect(wrapper.get('[data-testid=child-results-empty]').text()).toBe('No published report cards yet.')
  })

  it('switches tabs with the URL (so Back returns to the tab), with their empty states', async () => {
    const wrapper = await mountSuspended(ChildPage, { route: '/my-children/c1' })
    const selected = () => wrapper.findAll('[role=tab]').filter(t => t.attributes('aria-selected') === 'true').map(t => t.text())
    expect(selected()).toEqual(['Results'])

    await useRouter().replace('/my-children/c1?tab=attendance')
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(selected()).toEqual(['Attendance'])
    expect(wrapper.get('[data-testid=child-attendance-empty]').text()).toBe('No registers taken in this term yet.')

    await useRouter().replace('/my-children/c1?tab=fees')
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(selected()).toEqual(['Fees'])
    expect(wrapper.get('[data-testid=child-fees-empty]').text()).toBe('No bill for First Term 2026/2027 yet.')
  })

  it('shows the read-only bill on the Fees tab, without Reverse', async () => {
    bill = {
      lines: [{ kind: 'item', description: 'Tuition', amountKobo: 7_000_000 }],
      discounts: [],
      payments: [{ id: 'p1', receiptNumber: 'RCT/2026/000001', amountKobo: 2_000_000, method: 'cash', reference: null, paidOn: '2026-10-05', reversed: false }],
      totals: { itemsTotal: 7_000_000, carryForward: 0, discountTotal: 0, billed: 7_000_000, paid: 2_000_000, reversed: 0, balance: 5_000_000 },
    }
    const wrapper = await mountSuspended(ChildPage, { route: '/my-children/c1?tab=fees' })

    expect(wrapper.get('[data-testid=bill-balance]').text()).toBe('₦50,000.00')
    expect(wrapper.find('[data-testid="receipt-RCT/2026/000001"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="reverse-RCT/2026/000001"]').exists()).toBe(false)
  })
})

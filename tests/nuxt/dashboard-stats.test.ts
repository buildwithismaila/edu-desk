import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import DashboardStats from '~/components/dashboard/DashboardStats.vue'

const fees = { expectedKobo: 27_000_000, collectedKobo: 11_750_000, outstandingKobo: 15_250_000, percentCollected: 44, todayKobo: 3_000_000, debtors: 2 }
const full = {
  term: { id: 't1', label: 'First Term 2026/2027' },
  students: { total: 43, bySection: [{ section: 'jss', count: 18 }, { section: 'sss', count: 25 }], female: 20, male: 23 },
  attendance: { date: '2026-10-14', taken: 1, total: 3, marked: 10, present: 9, absent: 1, late: 2, rate: 90, notTaken: [{ id: 'a2', label: 'JSS 1B' }, { id: 'a3', label: 'SSS 1A' }] },
  fees,
  results: { sheets: { complete: 12, total: 30 }, arms: { draft: 2, submitted: 0, published: 1 } },
}
let stats: unknown = full
registerEndpoint('/api/dashboard', () => stats)

afterEach(() => {
  clearNuxtData()
  stats = full
})

describe('DashboardStats', () => {
  it('shows every block for admin and principal', async () => {
    const wrapper = await mountSuspended(DashboardStats)

    expect(wrapper.text()).toContain('First Term 2026/2027')
    expect(wrapper.get('[data-testid=stats-students-total]').text()).toBe('43')
    expect(wrapper.get('[data-testid=stats-students]').text()).toContain('20 girls · 23 boys')
    expect(wrapper.get('[data-testid=stats-students]').text()).toContain('Junior Secondary 18')
    expect(wrapper.get('[data-testid=stats-attendance-rate]').text()).toBe('90%')
    expect(wrapper.get('[data-testid=stats-attendance]').text()).toContain('1 of 3 classes taken · 1 absent')
    const missing = wrapper.get('[data-testid=stats-attendance-missing]')
    expect(missing.text()).toMatch(/^Not taken:/)
    expect(missing.findAll('a').map(a => [a.text(), a.attributes('href')])).toEqual([['JSS 1B', '/attendance?arm=a2'], ['SSS 1A', '/attendance?arm=a3']])
    expect(wrapper.get('[data-testid=stats-fees-collected]').text()).toBe('₦117,500.00')
    expect(wrapper.get('[data-testid=stats-fees]').text()).toContain('of ₦270,000.00 expected (44%)')
    expect(wrapper.get('[data-testid=stats-fees-today]').text()).toBe('₦30,000.00')
    expect(wrapper.get('[data-testid=stats-fees-debtors]').text()).toBe('2 debtors')
    expect(wrapper.get('[data-testid=stats-results-sheets]').text()).toBe('12 / 30')
    expect(wrapper.get('[data-testid=stats-results-arms]').text()).toBe('2 draft · 0 submitted · 1 published')
  })

  it('shows the bursar students and fees only', async () => {
    stats = { ...full, attendance: null, results: null }
    const wrapper = await mountSuspended(DashboardStats)

    expect(wrapper.find('[data-testid=stats-students]').exists()).toBe(true)
    expect(wrapper.find('[data-testid=stats-fees]').exists()).toBe(true)
    expect(wrapper.find('[data-testid=stats-attendance]').exists()).toBe(false)
    expect(wrapper.find('[data-testid=stats-results]').exists()).toBe(false)
  })

  it('has empty states before the first register, bill or term', async () => {
    stats = {
      ...full,
      attendance: { ...full.attendance, taken: 0, marked: 0, present: 0, absent: 0, late: 0, rate: null },
      fees: { ...fees, expectedKobo: 0, collectedKobo: 0, outstandingKobo: 0, percentCollected: null, todayKobo: 0, debtors: 0 },
    }
    let wrapper = await mountSuspended(DashboardStats)
    expect(wrapper.get('[data-testid=stats-attendance-rate]').text()).toBe('—')
    expect(wrapper.get('[data-testid=stats-fees]').text()).toContain('of ₦0.00 expected')
    expect(wrapper.get('[data-testid=stats-fees]').text()).not.toContain('%')

    clearNuxtData()
    stats = { term: null, students: null, attendance: null, fees: null, results: null }
    wrapper = await mountSuspended(DashboardStats)
    expect(wrapper.get('[data-testid=dashboard-no-term]').text()).toContain('Set the current term in Calendar')
  })
})

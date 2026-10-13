import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ChildCard from '~/components/dashboard/ChildCard.vue'

type Child = { attendanceRate: number | null, absentDays: number, balanceKobo: number | null, latestReportCard: { termId: string, term: string } | null }

const base = { id: 's1', name: 'Somto Eze', admissionNumber: 'GFA/2026/0002', classLabel: 'Primary 3A', photoUrl: null, attendanceRate: null, absentDays: 0, balanceKobo: null, latestReportCard: null }
const mount = (child: Partial<Child>) => mountSuspended(ChildCard, { props: { child: { ...base, ...child } as never } })
const text = (wrapper: Awaited<ReturnType<typeof mount>>, id: string) => wrapper.get(`[data-testid="${id}-GFA/2026/0002"]`).text()

describe('ChildCard', () => {
  it('links to the child\'s page', async () => {
    const wrapper = await mount({})
    expect(wrapper.get('[data-testid="my-child-open-GFA/2026/0002"]').attributes('href')).toBe('/my-children/s1')
    expect(text(wrapper, 'my-child')).toContain('Somto EzePrimary 3AGFA/2026/0002')
  })

  it('shows this term\'s attendance', async () => {
    expect(text(await mount({}), 'my-child-attendance')).toBe('Not taken yet')
    expect(text(await mount({ attendanceRate: 96, absentDays: 2 }), 'my-child-attendance')).toBe('96% · absent 2 days')
    expect(text(await mount({ attendanceRate: 90, absentDays: 1 }), 'my-child-attendance')).toBe('90% · absent 1 day')
  })

  it('shows owing, fully paid, credit or no bill', async () => {
    expect(text(await mount({ balanceKobo: 3_650_000 }), 'my-child-fees')).toBe('Owing ₦36,500.00')
    expect(text(await mount({ balanceKobo: 0 }), 'my-child-fees')).toBe('Fully paid')
    expect(text(await mount({ balanceKobo: -500_000 }), 'my-child-fees')).toBe('Credit ₦5,000.00')
    expect(text(await mount({}), 'my-child-fees')).toBe('No bill yet')
  })

  it('links the latest published report card only when there is one', async () => {
    expect((await mount({})).find('[data-testid="my-child-report-GFA/2026/0002"]').exists()).toBe(false)
    const wrapper = await mount({ latestReportCard: { termId: 't1', term: 'First Term 2026/2027' } })
    const link = wrapper.get('[data-testid="my-child-report-GFA/2026/0002"]')
    expect(link.attributes('href')).toBe('/students/s1/report-card?term=t1')
    expect(link.text()).toBe('Report card · First Term 2026/2027')
  })
})

import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import PromotionArm from '~/components/promotion/PromotionArm.vue'

const levels = [
  { id: 'l1', name: 'JSS 1', section: 'jss', sortOrder: 1 },
  { id: 'l2', name: 'JSS 2', section: 'jss', sortOrder: 2 },
]
const arms = [
  { id: 'a1', classLevelId: 'l1', name: 'A', label: 'JSS 1A' },
  { id: 'b1', classLevelId: 'l1', name: 'B', label: 'JSS 1B' },
  { id: 'a2', classLevelId: 'l2', name: 'A', label: 'JSS 2A' },
]
const student = (n: number, overrides = {}) => ({ id: `s${n}`, name: `Student ${n}`, admissionNumber: `P/000${n}`, average: 60 + n, enrolledNext: null, outcome: 'promoted', toClassArmId: 'a2', ...overrides })
const base = {
  arm: { id: 'a1', label: 'JSS 1A' },
  from: { id: 'f', name: '2026/2027' },
  to: { id: 't', name: '2027/2028' },
  resultsPublished: true,
  promotion: null,
  canUndo: false,
  students: [student(1), student(2), student(3)],
  levels,
  arms,
}
const mount = (data: Record<string, unknown> = {}) => mountSuspended(PromotionArm, { props: { data: { ...base, ...data } as never } })

describe('PromotionArm', () => {
  it('starts from the defaults and summarises them', async () => {
    const wrapper = await mount()
    expect(wrapper.get('[data-testid=promotion-summary]').text()).toBe('3 promoted')
    expect(wrapper.get('[data-testid=promotion-confirm]').text()).toBe('Promote into 2027/2028')
    expect(wrapper.get('[data-testid=promotion-confirm]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="promotion-row-P/0001"]').text()).toContain('Average 61')
  })

  it('updates the summary with "Set all to", and clears the class for leavers', async () => {
    const wrapper = await mount()
    await wrapper.get('[data-testid=promotion-all-withdrawn]').trigger('click')
    expect(wrapper.get('[data-testid=promotion-summary]').text()).toBe('3 withdrawn')
    expect(wrapper.findAll('[data-testid=promotion-target-select]')).toHaveLength(0)

    await wrapper.get('[data-testid=promotion-all-repeated]').trigger('click')
    expect(wrapper.get('[data-testid=promotion-summary]').text()).toBe('3 repeating')
    expect(wrapper.findAll('[data-testid=promotion-target-select]')).toHaveLength(3)
    expect(wrapper.findAll('[data-testid=promotion-row-error]')).toHaveLength(0)

    await wrapper.get('[data-testid=promotion-all-promoted]').trigger('click')
    const emitted = async () => {
      await wrapper.get('[data-testid=promotion-confirm]').trigger('click')
      return wrapper.emitted('promote')!.at(-1)![0]
    }
    expect(await emitted()).toEqual([1, 2, 3].map(n => ({ studentId: `s${n}`, outcome: 'promoted', toClassArmId: 'a2' })))
  })

  it('asks for a class when the default has none, and blocks Confirm until chosen', async () => {
    const wrapper = await mount({ students: [student(1, { toClassArmId: null }), student(2)] })
    expect(wrapper.get('[data-testid=promotion-row-error]').text()).toBe('Choose a class')
    expect(wrapper.get('[data-testid=promotion-confirm]').attributes('disabled')).toBeDefined()
  })

  it('skips students already placed next session', async () => {
    const wrapper = await mount({ students: [student(1, { enrolledNext: 'JSS 1B' }), student(2)] })
    expect(wrapper.get('[data-testid="promotion-row-P/0001"]').text()).toContain('Already in JSS 1B next session — skipped')
    expect(wrapper.get('[data-testid=promotion-summary]').text()).toBe('1 promoted · 1 already placed')
  })

  it('shows the recorded outcomes read-only once promoted, with Undo while allowed', async () => {
    const wrapper = await mount({
      promotion: { at: '2026-10-14T10:00:00Z', by: 'Adaeze Okafor' },
      canUndo: true,
      students: [student(1), student(2, { outcome: 'withdrawn', toClassArmId: null })],
    })
    expect(wrapper.get('[data-testid=promotion-done]').text()).toContain('Promoted')
    expect(wrapper.find('[data-testid=promotion-confirm]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid=promotion-outcome]').map(o => o.text())).toEqual(['Promote → JSS 2A', 'Withdraw'])
    await wrapper.get('[data-testid=promotion-undo]').trigger('click')
    expect(wrapper.emitted('undo')).toHaveLength(1)
  })

  it('says to create the next session first', async () => {
    const wrapper = await mount({ to: null })
    expect(wrapper.get('[data-testid=promotion-no-session]').text()).toContain('Create the next session in Calendar first')
    expect(wrapper.find('[data-testid=promotion-confirm]').exists()).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { DEFAULT_GRADE_BANDS } from '#shared/constants/academics'
import GradingScaleEditor from '~/components/settings/GradingScaleEditor.vue'

const mountEditor = (bands: { grade: string, minScore: number, maxScore: number, remark: string }[]) =>
  mountSuspended(GradingScaleEditor, { props: { section: 'primary', bands } })

describe('GradingScaleEditor', () => {
  it('shows the bands and allows saving a valid scale', async () => {
    const wrapper = await mountEditor(DEFAULT_GRADE_BANDS.primary)

    expect(wrapper.findAll('[data-testid=band-row]')).toHaveLength(6)
    expect(wrapper.find('[data-testid=grading-errors]').exists()).toBe(false)
    expect(wrapper.get('[data-testid=grading-save]').attributes('disabled')).toBeUndefined()
  })

  it('shows a gap as soon as a band is removed, and blocks saving', async () => {
    const wrapper = await mountEditor(DEFAULT_GRADE_BANDS.primary)

    // Remove "D" (45–49)
    await wrapper.findAll('[data-testid=remove-band]')[3]!.trigger('click')

    expect(wrapper.get('[data-testid=grading-errors]').text()).toContain('Gap between 44 and 50: scores 45–49 have no grade')
    expect(wrapper.get('[data-testid=grading-save]').attributes('disabled')).toBeDefined()
  })

  it('shows every problem with an invalid scale', async () => {
    const wrapper = await mountEditor([
      { grade: 'A', minScore: 50, maxScore: 99, remark: '' },
      { grade: 'B', minScore: 40, maxScore: 50, remark: '' },
    ])

    const errors = wrapper.get('[data-testid=grading-errors]').text()
    expect(errors).toContain('The lowest band must start at 0')
    expect(errors).toContain('The highest band must end at 100')
    expect(errors).toContain('B (40–50) overlaps A (50–99)')
  })

  it('flags a new empty band until it is filled in', async () => {
    const wrapper = await mountEditor(DEFAULT_GRADE_BANDS.primary)

    await wrapper.findAll('button').find(b => b.text() === 'Add band')!.trigger('click')

    expect(wrapper.findAll('[data-testid=band-row]')).toHaveLength(7)
    expect(wrapper.get('[data-testid=grading-errors]').text()).toContain('Every band needs a grade')
  })
})

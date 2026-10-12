import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { DEFAULT_ASSESSMENT_COMPONENTS } from '#shared/constants/academics'
import AssessmentEditor from '~/components/settings/AssessmentEditor.vue'

const mountEditor = () => mountSuspended(AssessmentEditor, { props: { components: DEFAULT_ASSESSMENT_COMPONENTS } })

describe('AssessmentEditor', () => {
  it('shows the components with a total of 100 and allows saving', async () => {
    const wrapper = await mountEditor()

    expect(wrapper.findAll('[data-testid=assessment-row]')).toHaveLength(3)
    expect(wrapper.get('[data-testid=assessment-total]').text()).toBe('Total: 100 / 100')
    expect(wrapper.find('[data-testid=assessment-errors]').exists()).toBe(false)
    expect(wrapper.get('[data-testid=assessment-save]').attributes('disabled')).toBeUndefined()
  })

  it('updates the total when a component is removed, and blocks saving', async () => {
    const wrapper = await mountEditor()

    // Remove CA2 (20)
    await wrapper.findAll('[data-testid=remove-assessment-row]')[1]!.trigger('click')

    expect(wrapper.get('[data-testid=assessment-total]').text()).toBe('Total: 80 / 100')
    expect(wrapper.get('[data-testid=assessment-errors]').text()).toContain('Total is 80; it must be 100')
    expect(wrapper.get('[data-testid=assessment-save]').attributes('disabled')).toBeDefined()
  })

  it('flags a duplicate name', async () => {
    const wrapper = await mountEditor()

    await wrapper.findAll('[data-testid=assessment-row] input')[0]!.setValue('Exam')

    expect(wrapper.get('[data-testid=assessment-errors]').text()).toContain('Each component needs a different name')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery } from 'h3'
import GuardianPicker, { type GuardianEntry } from '~/components/students/GuardianPicker.vue'

let searched: unknown
registerEndpoint('/api/guardians', (event) => {
  searched = getQuery(event).search
  return [{ id: 'g1', name: 'Ngozi Eze', phone: '+2348031110001', email: null, children: ['Chidera Eze'] }]
})

async function mountPicker(modelValue: GuardianEntry[] = [], props: Record<string, unknown> = {}) {
  const wrapper = await mountSuspended(GuardianPicker, {
    props: {
      ...props,
      'modelValue': modelValue,
      'onUpdate:modelValue': (value: GuardianEntry[]) => wrapper.setProps({ modelValue: value }),
    },
  })
  return wrapper
}

const lastModel = (wrapper: Awaited<ReturnType<typeof mountPicker>>) => wrapper.emitted('update:modelValue')?.at(-1)?.[0]

describe('GuardianPicker', () => {
  it('finds an existing guardian by name or phone and adds them by id', async () => {
    const wrapper = await mountPicker()

    await wrapper.get('input[data-testid=guardian-search]').setValue('ngozi')
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid=guardian-result]')).toHaveLength(1))
    expect(searched).toBe('ngozi')
    expect(wrapper.get('[data-testid=guardian-result]').text()).toContain('Parent of Chidera Eze')

    await wrapper.get('[data-testid=guardian-result] button').trigger('click')

    expect(lastModel(wrapper)).toEqual([{ guardianId: 'g1', name: 'Ngozi Eze', phone: '+2348031110001', relationship: 'guardian' }])
    expect(wrapper.get('[data-testid=picked-guardian]').text()).toContain('Existing')
    expect(wrapper.get('[data-testid=guardian-result] button').text()).toBe('Added')
  })

  it('validates a new guardian before adding them, with the phone normalised', async () => {
    const wrapper = await mountPicker()
    await wrapper.get('[data-testid=guardian-mode-new]').trigger('click')

    await wrapper.get('input[data-testid=new-guardian-name]').setValue('Musa Bello')
    await wrapper.get('input[data-testid=new-guardian-phone]').setValue('123')
    await wrapper.get('[data-testid=new-guardian-add]').trigger('click')

    expect(wrapper.text()).toContain('Enter a Nigerian phone number, e.g. 0803 123 4567')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await wrapper.get('input[data-testid=new-guardian-phone]').setValue('0803 111 0002')
    await wrapper.get('[data-testid=new-guardian-add]').trigger('click')

    expect(lastModel(wrapper)).toEqual([{ name: 'Musa Bello', phone: '+2348031110002', email: '', relationship: 'guardian' }])
    expect(wrapper.get('[data-testid=picked-guardian]').text()).toContain('New')
  })

  it('requires a name for a new guardian and refuses the same phone twice', async () => {
    const wrapper = await mountPicker([{ name: 'Musa Bello', phone: '+2348031110002', email: '', relationship: 'father' }])
    await wrapper.get('[data-testid=guardian-mode-new]').trigger('click')

    await wrapper.get('[data-testid=new-guardian-add]').trigger('click')
    expect(wrapper.text()).toContain('Enter the guardian\'s full name')

    await wrapper.get('input[data-testid=new-guardian-name]').setValue('Musa B')
    await wrapper.get('input[data-testid=new-guardian-phone]').setValue('08031110002')
    await wrapper.get('[data-testid=new-guardian-add]').trigger('click')
    expect(wrapper.text()).toContain('This guardian is already added')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('hides the add panel once the limit is reached and lets you remove a guardian', async () => {
    const wrapper = await mountPicker([{ guardianId: 'g1', name: 'Ngozi Eze', phone: '+2348031110001', relationship: 'mother' }], { max: 1 })

    expect(wrapper.find('[data-testid=guardian-search]').exists()).toBe(false)

    await wrapper.get('[aria-label="Remove Ngozi Eze"]').trigger('click')
    expect(lastModel(wrapper)).toEqual([])
    expect(wrapper.find('[data-testid=guardian-search]').exists()).toBe(true)
  })
})

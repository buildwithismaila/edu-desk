import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import NairaInput from '~/components/fees/NairaInput.vue'

async function mount(modelValue: string) {
  const wrapper = await mountSuspended(NairaInput, {
    props: { 'modelValue': modelValue, 'onUpdate:modelValue': (value: string) => wrapper.setProps({ modelValue: value }) },
  })
  return wrapper
}

describe('NairaInput', () => {
  it('keeps what is typed, with a ₦ prefix', async () => {
    const wrapper = await mount('')
    await wrapper.get('input').setValue('25,000.5')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['25,000.5'])
    expect(wrapper.text()).toContain('₦')
    expect(wrapper.find('[data-testid=naira-error]').exists()).toBe(false)
  })

  it('shows a message for an amount it can\'t read', async () => {
    const wrapper = await mount('25.555')
    expect(wrapper.get('[data-testid=naira-error]').text()).toBe('Enter an amount like 25,000 or 25,000.50')
    await wrapper.setProps({ modelValue: 'abc' })
    expect(wrapper.find('[data-testid=naira-error]').exists()).toBe(true)
    await wrapper.setProps({ modelValue: '' })
    expect(wrapper.find('[data-testid=naira-error]').exists()).toBe(false)
  })
})

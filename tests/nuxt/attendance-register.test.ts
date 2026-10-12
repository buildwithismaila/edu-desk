import { describe, expect, it } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AttendanceRegister from '~/components/attendance/AttendanceRegister.vue'

const students = [
  { id: 's1', name: 'Bola Ade', admissionNumber: 'GFA/2026/0001', photoUrl: null, status: null },
  { id: 's2', name: 'Chidi Eze', admissionNumber: 'GFA/2026/0002', photoUrl: null, status: 'absent' as const },
  { id: 's3', name: 'Ada Obi', admissionNumber: 'GFA/2026/0003', photoUrl: null, status: null },
]

const row = (wrapper: VueWrapper, admissionNumber: string) => wrapper.get(`[data-testid="register-row-${admissionNumber}"]`)
const pressed = (wrapper: VueWrapper, admissionNumber: string) =>
  row(wrapper, admissionNumber).findAll('button').find(b => b.attributes('aria-pressed') === 'true')!.text()

describe('AttendanceRegister', () => {
  it('starts unmarked students as present and keeps saved marks', async () => {
    const wrapper = await mountSuspended(AttendanceRegister, { props: { students } })

    expect(pressed(wrapper, 'GFA/2026/0001')).toBe('P')
    expect(pressed(wrapper, 'GFA/2026/0002')).toBe('A')
    expect(wrapper.get('[data-testid=register-counts]').text()).toBe('Present 2 · Absent 1 · Late 0')
  })

  it('changes a student with one tap and updates the counts', async () => {
    const wrapper = await mountSuspended(AttendanceRegister, { props: { students } })

    await row(wrapper, 'GFA/2026/0003').get('[data-testid=mark-late]').trigger('click')
    await row(wrapper, 'GFA/2026/0001').get('[data-testid=mark-absent]').trigger('click')

    expect(pressed(wrapper, 'GFA/2026/0003')).toBe('L')
    expect(wrapper.get('[data-testid=register-counts]').text()).toBe('Present 0 · Absent 2 · Late 1')
  })

  it('marks everyone present', async () => {
    const wrapper = await mountSuspended(AttendanceRegister, { props: { students } })

    await wrapper.get('[data-testid=register-all-present]').trigger('click')

    expect(wrapper.get('[data-testid=register-counts]').text()).toBe('Present 3 · Absent 0 · Late 0')
  })

  it('saves exactly one mark per student', async () => {
    const wrapper = await mountSuspended(AttendanceRegister, { props: { students } })
    await row(wrapper, 'GFA/2026/0003').get('[data-testid=mark-late]').trigger('click')

    await wrapper.get('[data-testid=register-save]').trigger('click')

    expect(wrapper.emitted('save')).toEqual([[[
      { studentId: 's1', status: 'present' },
      { studentId: 's2', status: 'absent' },
      { studentId: 's3', status: 'late' },
    ]]])
  })

  it('is read-only when it can\'t be edited', async () => {
    const wrapper = await mountSuspended(AttendanceRegister, { props: { students, readonly: true } })

    expect(row(wrapper, 'GFA/2026/0001').get('[data-testid=mark-absent]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid=register-save]').exists()).toBe(false)
    expect(wrapper.find('[data-testid=register-all-present]').exists()).toBe(false)
  })
})

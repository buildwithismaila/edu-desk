import { describe, expect, it } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { DEFAULT_GRADE_BANDS } from '~~/shared/constants/academics'
import type { ScoreCell } from '~~/shared/utils/scores'
import ScoreGrid from '~/components/scores/ScoreGrid.vue'

const components = [
  { id: 'ca1', name: 'CA1', maxScore: 20 },
  { id: 'ca2', name: 'CA2', maxScore: 20 },
  { id: 'exam', name: 'Exam', maxScore: 60 },
]
const students: { id: string, name: string, admissionNumber: string, photoUrl: null, cells: Record<string, ScoreCell> }[] = [
  { id: 's1', name: 'Bola Ade', admissionNumber: 'GFA/2026/0001', photoUrl: null, cells: { ca1: { score: 15, absent: false }, exam: { score: null, absent: true } } },
  { id: 's2', name: 'Chidi Eze', admissionNumber: 'GFA/2026/0002', photoUrl: null, cells: {} },
  { id: 's3', name: 'Ada Obi', admissionNumber: 'GFA/2026/0003', photoUrl: null, cells: {} },
]
const mount = (props: Record<string, unknown> = {}) =>
  mountSuspended(ScoreGrid, { props: { components, bands: DEFAULT_GRADE_BANDS.jss, students, ...props }, attachTo: document.body })

const input = (wrapper: VueWrapper, row: number, col: number) => wrapper.get<HTMLInputElement>(`input[data-cell="${row}-${col}"]`)

describe('ScoreGrid', () => {
  it('shows each component with its max, saved values (ABS included), totals and grades', async () => {
    const wrapper = await mount()

    expect(wrapper.findAll('th').map(th => th.text())).toEqual(['Student', 'CA1/20', 'CA2/20', 'Exam/60', 'Total', 'Grade'])
    expect(input(wrapper, 0, 0).element.value).toBe('15')
    expect(input(wrapper, 0, 2).element.value).toBe('ABS')
    expect(wrapper.get('[data-testid=total-0]').text()).toBe('15')
    expect(wrapper.get('[data-testid=grade-0]').text()).toBe('F')
    expect(wrapper.get('[data-testid=total-1]').text()).toBe('—')
  })

  it('updates the total and grade as scores are typed', async () => {
    const wrapper = await mount()

    await input(wrapper, 1, 0).setValue('18')
    await input(wrapper, 1, 1).setValue('17')
    await input(wrapper, 1, 2).setValue('40')

    expect(wrapper.get('[data-testid=total-1]').text()).toBe('75')
    expect(wrapper.get('[data-testid=grade-1]').text()).toBe('A')
  })

  it('moves down with Enter and ↓, up with ↑', async () => {
    const wrapper = await mount()

    await input(wrapper, 0, 1).trigger('keydown', { key: 'Enter' })
    expect(document.activeElement).toBe(input(wrapper, 1, 1).element)
    await input(wrapper, 1, 1).trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(input(wrapper, 2, 1).element)
    await input(wrapper, 2, 1).trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(input(wrapper, 1, 1).element)
    wrapper.unmount()
  })

  it('shows a message for an invalid cell and blocks saving', async () => {
    const wrapper = await mount()

    await input(wrapper, 1, 0).setValue('21')
    await input(wrapper, 2, 2).setValue('7.5')

    expect(wrapper.get('[data-testid=cell-error-1-0]').text()).toBe('Enter a score from 0 to 20')
    expect(wrapper.get('[data-testid=cell-error-2-2]').text()).toBe('Use whole numbers')
    expect(wrapper.get('[data-testid=scores-error-count]').text()).toBe('Fix 2 cells before saving.')
    expect(wrapper.get('[data-testid=scores-save]').attributes('disabled')).toBeDefined()
  })

  it('accepts ABS (or a) and emits only the changed cells on save', async () => {
    const wrapper = await mount()

    await input(wrapper, 1, 0).setValue('a')
    await input(wrapper, 2, 2).setValue('55')
    await input(wrapper, 0, 0).setValue('')
    // Retyping a saved value isn't a change
    await input(wrapper, 0, 2).setValue('abs')
    expect(wrapper.get('[data-testid=scores-save]').text()).toBe('Save 3 changes')

    await wrapper.get('[data-testid=scores-save]').trigger('click')

    expect(wrapper.emitted('save')).toEqual([[[
      { studentId: 's1', componentId: 'ca1', value: null },
      { studentId: 's2', componentId: 'ca1', value: 'ABS' },
      { studentId: 's3', componentId: 'exam', value: 55 },
    ]]])
    expect(wrapper.emitted('dirty')!.at(-1)).toEqual([true])
  })

  it('shows server problems for cells, and is read-only when asked', async () => {
    const withErrors = await mount({ serverErrors: { 's2:ca1': 'This student isn\'t on this sheet' } })
    expect(withErrors.get('[data-testid=cell-error-1-0]').text()).toBe('This student isn\'t on this sheet')

    const readonly = await mount({ readonly: true })
    expect(input(readonly, 0, 0).attributes('disabled')).toBeDefined()
    expect(readonly.find('[data-testid=scores-save]').exists()).toBe(false)
  })
})

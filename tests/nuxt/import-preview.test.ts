import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ImportPreview from '~/components/students/ImportPreview.vue'

describe('ImportPreview', () => {
  it('lists every problem with its row and column, and disables the import', async () => {
    const wrapper = await mountSuspended(ImportPreview, {
      props: {
        result: {
          valid: false,
          rows: 1,
          errors: [
            { row: 3, column: 'gender', message: 'Use M, F, Male or Female' },
            { row: 4, column: 'classArm', message: 'No class arm called "JSS 9Z"' },
          ],
        },
      },
    })

    expect(wrapper.get('[data-testid=import-problems]').text()).toContain('2 problems in the file')
    const rows = wrapper.findAll('[data-testid=import-errors] tbody tr')
    expect(rows.map(r => r.findAll('td').map(td => td.text()))).toEqual([
      ['3', 'gender', 'Use M, F, Male or Female'],
      ['4', 'classArm', 'No class arm called "JSS 9Z"'],
    ])
    expect(wrapper.get('[data-testid=import-confirm]').attributes('disabled')).toBeDefined()
  })

  it('offers to import a valid file', async () => {
    const wrapper = await mountSuspended(ImportPreview, { props: { result: { valid: true, rows: 2, errors: [] } } })

    expect(wrapper.get('[data-testid=import-ready]').text()).toContain('2 students are ready to import')
    expect(wrapper.find('[data-testid=import-errors]').exists()).toBe(false)
    const button = wrapper.get('[data-testid=import-confirm]')
    expect(button.text()).toBe('Import 2 students')
    expect(button.attributes('disabled')).toBeUndefined()

    await button.trigger('click')
    expect(wrapper.emitted('import')).toHaveLength(1)
  })
})

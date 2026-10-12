import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import ArmAssignmentEditor from '~/components/assignments/ArmAssignmentEditor.vue'

const sent: { path: string, body: unknown }[] = []
for (const path of ['/api/class-arms/arm-1/class-teacher', '/api/class-arms/arm-1/subject-teachers']) {
  registerEndpoint(path, {
    method: 'PUT',
    handler: async (event) => {
      sent.push({ path, body: await readBody(event) })
      return {}
    },
  })
}

const tunde = { id: 't1', name: 'Tunde Adeyemi', isActive: true }
const arm = {
  classArmId: 'arm-1',
  label: 'JSS 1A',
  classTeacher: tunde,
  subjects: [
    { subjectId: 'eng', name: 'English Language', teacher: null },
    { subjectId: 'mth', name: 'Mathematics', teacher: tunde },
  ],
}
const teachers = [{ id: 't1', name: 'Tunde Adeyemi' }, { id: 't2', name: 'Chioma Obi' }]

const mountEditor = (overrides = {}) =>
  mountSuspended(ArmAssignmentEditor, { props: { arm: { ...arm, ...overrides }, sessionId: 's1', teachers } })

describe('ArmAssignmentEditor', () => {
  it('shows a row per subject and counts the unassigned ones', async () => {
    const wrapper = await mountEditor()

    expect(wrapper.find('[data-testid="subject-row-English Language"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="subject-row-Mathematics"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid=unassigned-warning]').text()).toBe('1 unassigned')
  })

  it('has nothing to save until something changes', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.get('[data-testid=assignments-save]').attributes('disabled')).toBeDefined()
  })

  it('saves only what changed', async () => {
    sent.length = 0
    const wrapper = await mountEditor()
    const vm = wrapper.vm as unknown as { classTeacher: string, subjectTeachers: Record<string, string> }

    // Pick Chioma for English, clear the class teacher
    vm.subjectTeachers.eng = 't2'
    vm.classTeacher = 'none'
    await flushPromises()
    await wrapper.get('[data-testid=assignments-save]').trigger('click')

    await vi.waitFor(() => expect(sent).toHaveLength(2))
    expect(sent).toEqual([
      { path: '/api/class-arms/arm-1/class-teacher', body: { sessionId: 's1', userId: null } },
      { path: '/api/class-arms/arm-1/subject-teachers', body: { sessionId: 's1', assignments: [{ subjectId: 'eng', userId: 't2' }] } },
    ])
  })

  it('offers a deactivated teacher who is still assigned, labelled as such', async () => {
    const wrapper = await mountEditor({ classTeacher: { id: 'old', name: 'Musa Ibrahim', isActive: false } })

    expect(wrapper.text()).toContain('This teacher is deactivated')
  })
})

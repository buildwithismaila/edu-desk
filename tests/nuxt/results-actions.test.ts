import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { Role } from '~~/shared/constants/roles'
import type { ResultStatus } from '~~/shared/utils/results'
import ResultsActions from '~/components/results/ResultsActions.vue'

async function buttons(status: ResultStatus, role: Role, isClassTeacher = false) {
  const wrapper = await mountSuspended(ResultsActions, { props: { status, role, isClassTeacher } })
  return wrapper.findAll('button').map(b => b.text())
}

describe('ResultsActions', () => {
  it('offers Submit to the class teacher of a draft, and nothing once submitted', async () => {
    expect(await buttons('draft', 'teacher', true)).toEqual(['Submit results'])
    expect(await buttons('submitted', 'teacher', true)).toEqual([])
    expect(await buttons('draft', 'teacher', false)).toEqual([])
  })

  it('offers the principal and admin the next steps for each status', async () => {
    expect(await buttons('draft', 'principal')).toEqual(['Submit results'])
    expect(await buttons('submitted', 'principal')).toEqual(['Publish', 'Return to draft'])
    expect(await buttons('published', 'admin')).toEqual(['Unpublish'])
  })

  it('emits the chosen action', async () => {
    const wrapper = await mountSuspended(ResultsActions, { props: { status: 'submitted', role: 'admin', isClassTeacher: false } })
    await wrapper.get('[data-testid=results-publish]').trigger('click')
    expect(wrapper.emitted('action')).toEqual([['publish']])
  })
})

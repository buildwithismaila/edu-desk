import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery } from 'h3'
import StudentList from '~/components/students/StudentList.vue'

const student = (id: string, firstName: string, lastName: string, classLabel: string | null = 'JSS 1A') => ({
  id, firstName, middleName: null, lastName, admissionNumber: `GFA/2026/${id}`, gender: 'female', classArmId: 'a1', classLabel, photoUrl: null,
})

let requests: Record<string, unknown>[] = []
let response: { items: unknown[], total: number, page: number, pageSize: number }
registerEndpoint('/api/students', (event) => {
  requests.push(getQuery(event))
  return response
})
registerEndpoint('/api/_auth/session', () => ({}))
registerEndpoint('/api/class-levels', () => [
  { id: 'l1', section: 'jss', name: 'JSS 1', sortOrder: 0, arms: [{ id: 'a1', classLevelId: 'l1', name: 'A', label: 'JSS 1A' }] },
])

// The auth middleware runs on the mounted route: be a logged-in admin
beforeEach(() => {
  useUserSession().session.value = { id: 'session-1', user: { id: 'u1', name: 'Admin', role: 'admin', mustChangePassword: false } }
})

afterEach(() => {
  requests = []
  useUserSession().session.value = null
  clearNuxtData()
})

const lastRequest = () => requests.at(-1)
const currentQuery = () => useRouter().currentRoute.value.query

describe('StudentList', () => {
  it('renders a row per student with a link to the profile and the total', async () => {
    response = { items: [student('0001', 'Ada', 'Obi'), student('0002', 'Bola', 'Ade', null)], total: 2, page: 1, pageSize: 25 }

    const wrapper = await mountSuspended(StudentList, { route: '/students' })

    const rows = wrapper.findAll('[data-testid=student-table] tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('Ada Obi')
    expect(rows[0]!.text()).toContain('GFA/2026/0001')
    expect(rows[1]!.text()).toContain('—')
    expect(rows[0]!.find('a').attributes('href')).toBe('/students/0001')
    expect(wrapper.get('[data-testid=student-total]').text()).toBe('2 students')
    expect(wrapper.find('[data-testid=student-pages]').exists()).toBe(false)
  })

  it('sends the search, filters and page from the URL to the API', async () => {
    response = { items: [], total: 0, page: 2, pageSize: 25 }

    const wrapper = await mountSuspended(StudentList, { route: '/students?search=ada&gender=female&classLevelId=l1&page=2' })

    expect(lastRequest()).toMatchObject({ search: 'ada', gender: 'female', classLevelId: 'l1', page: '2' })
    expect((wrapper.get('input[data-testid=student-search]').element as HTMLInputElement).value).toBe('ada')
  })

  it('pages through results by changing the URL', async () => {
    response = { items: [student('0001', 'Ada', 'Obi')], total: 60, page: 1, pageSize: 25 }

    const wrapper = await mountSuspended(StudentList, { route: '/students?gender=male' })
    const pageTwo = wrapper.get('[data-testid=student-pages]').findAll('button').find(b => b.text() === '2')!
    await pageTwo.trigger('click')

    await vi.waitFor(() => expect(currentQuery()).toEqual({ gender: 'male', page: '2' }))
    await vi.waitFor(() => expect(lastRequest()).toMatchObject({ gender: 'male', page: '2' }))
  })

  it('puts the typed search in the URL and goes back to page 1', async () => {
    response = { items: [], total: 0, page: 3, pageSize: 25 }

    const wrapper = await mountSuspended(StudentList, { route: '/students?page=3' })
    await wrapper.get('input[data-testid=student-search]').setValue('obi')

    await vi.waitFor(() => expect(currentQuery()).toEqual({ search: 'obi' }))
    await vi.waitFor(() => expect(lastRequest()).toMatchObject({ search: 'obi', page: '1' }))
  })
})

import { describe, expect, it } from 'vitest'
import type { InternalApi } from 'nitropack/types'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ReportCard from '~/components/results/ReportCard.vue'

type Report = InternalApi['/api/students/:id/report-card']['get']

const base: Report = {
  status: 'published' as const,
  publishedAt: '2026-12-18T10:00:00.000Z',
  school: { name: 'Greenfield Academy', address: '12 Allen Avenue, Ikeja', motto: 'Knowledge and character', logoUrl: null },
  student: { id: 's1', name: 'Ada Obi', admissionNumber: 'GFA/2026/0001', photoUrl: null },
  arm: { id: 'a1', label: 'JSS 1A', section: 'jss' as const },
  term: { id: 't1', number: 'first' as const, sessionName: '2026/2027', nextTermBeginsOn: '2027-01-11' },
  mode: 'scores' as const,
  components: [{ id: 'ca1', name: 'CA1', maxScore: 20 }, { id: 'ca2', name: 'CA2', maxScore: 20 }, { id: 'exam', name: 'Exam', maxScore: 60 }],
  subjects: [
    { id: 'eng', name: 'English Language', cells: [10, 10, 40] as (number | 'ABS' | null)[], total: 60, grade: 'B', remark: 'Very Good', position: 3 },
    { id: 'maths', name: 'Mathematics', cells: [15, 'ABS', 50] as (number | 'ABS' | null)[], total: 65, grade: 'B', remark: 'Very Good', position: 1 },
  ],
  nurseryRatings: [] as { subject: string, rating: string }[],
  summary: { total: 125, offered: 2, average: 62.5, position: 2, numberInClass: 30, showPositions: true, cumulativeAverage: null as number | null },
  attendance: { opened: 50, present: 48, absent: 2, late: 3, rate: 96 },
  traits: {
    affective: [{ label: 'Punctuality', rating: 4 as number | null }],
    psychomotor: [{ label: 'Handwriting', rating: null as number | null }],
  },
  comments: { classTeacher: 'Hard-working', principal: 'Well done' },
}

describe('ReportCard', () => {
  it('shows the school, the student, the subject table and the summary', async () => {
    const wrapper = await mountSuspended(ReportCard, { props: { report: base } })

    expect(wrapper.text()).toContain('Greenfield Academy')
    expect(wrapper.text()).toContain('Report card · First Term · 2026/2027')
    expect(wrapper.get('[data-testid=report-card-name]').text()).toBe('Ada Obi')
    expect(wrapper.text()).toContain('11/01/2027')
    const rows = wrapper.findAll('[data-testid=report-card-subjects] tbody tr').map(r => r.findAll('td').map(td => td.text()))
    expect(rows).toEqual([
      ['English Language', '10', '10', '40', '60', 'B', '3rd', 'Very Good'],
      ['Mathematics', '15', 'ABS', '50', '65', 'B', '1st', 'Very Good'],
    ])
    expect(wrapper.get('[data-testid=report-card-summary]').text()).toContain('Average: 62.50')
    expect(wrapper.get('[data-testid=report-card-position]').text()).toBe('2nd')
    expect(wrapper.get('[data-testid=report-card-summary]').text()).toContain('of 30')
  })

  it('shows attendance, ratings and both comments', async () => {
    const wrapper = await mountSuspended(ReportCard, { props: { report: base } })
    expect(wrapper.get('[data-testid=report-card-attendance]').text()).toBe('Present 48 of 50 days')
    expect(wrapper.text()).toContain('Punctuality4')
    expect(wrapper.get('[data-testid=report-card-class-teacher-comment]').text()).toBe('Hard-working')
    expect(wrapper.get('[data-testid=report-card-principal-comment]').text()).toBe('Well done')
    expect(wrapper.text()).not.toContain('Draft')
  })

  it('hides positions when the school turns them off, and marks drafts', async () => {
    const report = { ...base, status: 'draft' as const, summary: { ...base.summary, showPositions: false, position: null } }
    const wrapper = await mountSuspended(ReportCard, { props: { report } })
    expect(wrapper.find('[data-testid=report-card-position]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid=report-card-subjects] th').map(th => th.text())).not.toContain('Pos.')
    expect(wrapper.text()).toContain('Number in class: 30')
    expect(wrapper.text()).toContain('Draft — not yet published')
  })

  it('shows the cumulative average in the third term', async () => {
    const report = { ...base, summary: { ...base.summary, cumulativeAverage: 72.83 } }
    const wrapper = await mountSuspended(ReportCard, { props: { report } })
    expect(wrapper.get('[data-testid=report-card-summary]').text()).toContain('Cumulative average (session): 72.83')
  })

  it('shows skill ratings for Nursery instead of scores', async () => {
    const report = { ...base, mode: 'rating' as const, components: [], subjects: [], nurseryRatings: [{ subject: 'Numeracy', rating: 'Very Good' }] }
    const wrapper = await mountSuspended(ReportCard, { props: { report } })
    expect(wrapper.find('[data-testid=report-card-subjects]').exists()).toBe(false)
    expect(wrapper.find('[data-testid=report-card-summary]').exists()).toBe(false)
    expect(wrapper.get('[data-testid=report-card-skills]').text()).toContain('NumeracyVery Good')
  })
})

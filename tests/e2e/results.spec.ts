import { expect, type Page, test } from '@playwright/test'
import { apiFromPage, gotoHydrated, GREENFIELD_USERS, loginAs } from './support/auth'

// The full journey on JSS 1A: the seed leaves Chidera Eze's English Exam blank. Desktop only, because it
// changes JSS 1A's results; everything is undone at the end. Mobile only reads.

const CHIDERA = 'GFA/2026/0001'
const ENGLISH_TEACHER = 'chioma@greenfield.test'

type Sheets = { sheets: { classArmId: string, armLabel: string, subjectId: string, subjectName: string }[] }
type Sheet = { term: { id: string }, components: { id: string }[], students: { id: string, admissionNumber: string }[] }
type Results = { status: string, term: { id: string } }

async function switchUser(page: Page, email: string) {
  await page.context().clearCookies()
  await loginAs(page, email)
}

/** Undo the journey as admin: unpublish, return to draft, clear the comment and the Exam score. */
async function resetJss1a(page: Page) {
  await switchUser(page, GREENFIELD_USERS.admin.email)
  const { sheets } = await apiFromPage<Sheets>(page, 'GET', '/api/scores/sheets')
  const english = sheets.find(s => s.armLabel === 'JSS 1A' && s.subjectName === 'English Language')!
  const armId = english.classArmId
  const results = await apiFromPage<Results>(page, 'GET', `/api/results?classArmId=${armId}`)
  const body = { termId: results.term.id, classArmId: armId }
  if (results.status === 'published') await apiFromPage(page, 'POST', '/api/results/unpublish', body)
  if (results.status !== 'draft') await apiFromPage(page, 'POST', '/api/results/return', { ...body, reason: 'E2E cleanup' })

  const sheet = await apiFromPage<Sheet>(page, 'GET', `/api/scores/sheet?classArmId=${armId}&subjectId=${english.subjectId}`)
  const chidera = sheet.students.find(s => s.admissionNumber === CHIDERA)!
  await apiFromPage(page, 'PUT', '/api/results/principal-comments', { ...body, comments: [{ studentId: chidera.id, comment: null }] })
  await apiFromPage(page, 'PUT', '/api/scores/sheet', {
    ...body, subjectId: english.subjectId, entries: [{ studentId: chidera.id, componentId: sheet.components.at(-1)!.id, value: null }],
  })
}

test('scores are completed, the class teacher submits, the principal publishes, and the parent sees the report card', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Changes JSS 1A results; covered once on desktop')
  test.setTimeout(180_000)
  const comment = `Keep it up, Chidera (${Date.now().toString(36)})`

  // Start clean, even if an earlier failed run left JSS 1A submitted or the Exam filled
  await resetJss1a(page)

  try {
    // 1. The English teacher fills Chidera's missing Exam
    await switchUser(page, ENGLISH_TEACHER)
    await gotoHydrated(page, '/scores')
    await page.getByTestId('scores-sheet-JSS 1A-English Language').click()
    const exam = page.locator(`[data-testid="score-row-${CHIDERA}"] input`).nth(2)
    await exam.fill('55')
    await page.getByTestId('scores-save').click()
    await expect(page.getByTestId('scores-save')).toHaveText('Save')

    // 2. The class teacher sees the class complete and submits
    await switchUser(page, GREENFIELD_USERS.teacher.email)
    await gotoHydrated(page, '/results')
    await page.getByTestId('results-arm-JSS 1A').click()
    await expect(page.getByTestId('results-status')).toHaveText('Draft')
    await expect(page.getByTestId('results-incomplete')).toHaveCount(0)
    await page.getByTestId('results-submit').click()
    await page.getByTestId('confirm-dialog-confirm').click()
    await expect(page.getByTestId('results-status')).toHaveText('Submitted')

    // 3. The principal comments and publishes
    await switchUser(page, GREENFIELD_USERS.principal.email)
    await gotoHydrated(page, '/results')
    await page.getByTestId('results-arm-JSS 1A').click()
    await page.getByTestId(`principal-comment-${CHIDERA}`).fill(comment)
    await page.getByTestId('principal-comments-save').click()
    await expect(page.getByTestId('principal-comments-save')).toBeDisabled()
    await page.getByTestId('results-publish').click()
    await page.getByTestId('confirm-dialog-confirm').click()
    await expect(page.getByTestId('results-status')).toHaveText('Published')

    // 4. The parent opens Chidera's report card from My children
    await switchUser(page, GREENFIELD_USERS.parent.email)
    await page.getByTestId(`my-child-report-${CHIDERA}`).click()
    await expect(page.getByTestId('report-card-name')).toHaveText('Chidera Eze')
    const english = page.getByTestId('report-card-subjects').getByRole('row', { name: /English Language/ })
    await expect(english).toContainText('55')
    await expect(page.getByTestId('report-card-principal-comment')).toHaveText(comment)
  }
  finally {
    await resetJss1a(page)
  }
})

test('on a phone, results and a report card fit the screen', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile layout')
  const overflow = () => page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')

  await loginAs(page, GREENFIELD_USERS.teacher.email)
  await gotoHydrated(page, '/results')
  await page.getByTestId('results-arm-JSS 1A').click()
  await expect(page.getByTestId('results-table')).toBeVisible()
  expect(await overflow()).toBeLessThanOrEqual(0)

  await page.getByTestId('results-table').getByRole('link', { name: 'Chidera Eze' }).evaluate(link => link.removeAttribute('target'))
  await page.getByTestId('results-table').getByRole('link', { name: 'Chidera Eze' }).click()
  await expect(page.getByTestId('report-card-name')).toHaveText('Chidera Eze')
  expect(await overflow()).toBeLessThanOrEqual(0)
})

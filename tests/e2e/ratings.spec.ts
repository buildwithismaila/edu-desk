import { expect, test } from '@playwright/test'
import { apiFromPage, gotoHydrated, GREENFIELD_USERS, loginAs } from './support/auth'

// Desktop only: rates an unrated JSS 1A student and clears it again at the end.

type RatingsSheet = { term: { id: string }, arm: { id: string }, students: { id: string, admissionNumber: string }[] }

test('the class teacher rates a student and writes a comment', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Writes data; covered once on desktop')
  test.setTimeout(90_000)
  await loginAs(page, GREENFIELD_USERS.teacher.email)
  await gotoHydrated(page, '/scores/ratings')

  // The seed rates half of JSS 1A: take a student with nothing yet
  const unrated = page.locator('[data-testid^="ratings-student-"]').filter({ hasText: '0/10 rated' }).first()
  await expect(unrated).toBeVisible()
  const admissionNumber = (await unrated.getAttribute('data-testid'))!.replace('ratings-student-', '')
  // By id from here: the "0/10 rated" text changes as soon as a trait is rated
  const card = page.getByTestId(`ratings-student-${admissionNumber}`)
  const comment = `E2E comment ${Date.now().toString(36)}`

  try {
    await card.getByRole('button').first().click()
    await card.getByTestId('rate-punctuality-5').click()
    await card.getByTestId('rate-handwriting-3').click()
    await card.getByTestId('ratings-comment').fill(comment)
    await page.getByTestId('ratings-save').click()
    await expect(page.getByTestId('ratings-save')).toHaveText('Save')

    await page.reload()
    const saved = page.getByTestId(`ratings-student-${admissionNumber}`)
    await expect(saved).toContainText('2/10 rated · comment')
    await saved.getByRole('button').first().click()
    await expect(saved.getByTestId('rate-punctuality-5')).toHaveAttribute('aria-pressed', 'true')
    await expect(saved.getByTestId('ratings-comment')).toHaveValue(comment)
  }
  finally {
    const { arms } = await apiFromPage<{ arms: { id: string }[] }>(page, 'GET', '/api/attendance/arms')
    const sheet = await apiFromPage<RatingsSheet>(page, 'GET', `/api/ratings/sheet?classArmId=${arms[0]!.id}`)
    const student = sheet.students.find(s => s.admissionNumber === admissionNumber)
    if (student) {
      await apiFromPage(page, 'PUT', '/api/ratings/sheet', {
        termId: sheet.term.id, classArmId: sheet.arm.id,
        students: [{ studentId: student.id, ratings: { punctuality: null, handwriting: null }, comment: null }],
      })
    }
  }
})

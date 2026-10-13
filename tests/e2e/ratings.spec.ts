import { expect, test } from '@playwright/test'
import { apiFromPage, gotoHydrated, GREENFIELD_USERS, loginAs } from './support/auth'

// Desktop only: changes one JSS 1A student's punctuality rating and comment, then restores them.

type RatingsSheet = {
  term: { id: string }
  arm: { id: string }
  students: { id: string, admissionNumber: string, ratings: Record<string, number>, comment: string | null }[]
}

test('the class teacher rates a student and writes a comment', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Writes data; covered once on desktop')
  test.setTimeout(90_000)
  await loginAs(page, GREENFIELD_USERS.teacher.email)

  // The first student, as they are now (the seed rates the whole class)
  const { arms } = await apiFromPage<{ arms: { id: string }[] }>(page, 'GET', '/api/attendance/arms')
  const before = await apiFromPage<RatingsSheet>(page, 'GET', `/api/ratings/sheet?classArmId=${arms[0]!.id}`)
  const student = before.students[0]!
  const rating = student.ratings.punctuality === 5 ? 4 : 5
  const comment = `E2E comment ${Date.now().toString(36)}`

  try {
    await gotoHydrated(page, '/scores/ratings')
    const card = page.getByTestId(`ratings-student-${student.admissionNumber}`)
    await card.getByRole('button').first().click()
    await card.getByTestId(`rate-punctuality-${rating}`).click()
    await card.getByTestId('ratings-comment').fill(comment)
    await page.getByTestId('ratings-save').click()
    await expect(page.getByTestId('ratings-save')).toHaveText('Save')

    await page.reload()
    await card.getByRole('button').first().click()
    await expect(card.getByTestId(`rate-punctuality-${rating}`)).toHaveAttribute('aria-pressed', 'true')
    await expect(card.getByTestId('ratings-comment')).toHaveValue(comment)
  }
  finally {
    // Put back the punctuality rating and comment the student had
    await apiFromPage(page, 'PUT', '/api/ratings/sheet', {
      termId: before.term.id,
      classArmId: before.arm.id,
      students: [{ studentId: student.id, ratings: { punctuality: student.ratings.punctuality ?? null }, comment: student.comment }],
    })
  }
})

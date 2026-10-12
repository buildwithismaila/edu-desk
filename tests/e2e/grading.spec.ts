import { expect, test } from '@playwright/test'
import { GREENFIELD_USERS, loginAs } from './support/auth'

// Never saves: the grading scale stays as seeded for other tests and reruns

test('an invalid grading scale shows the problem and can\'t be saved', async ({ page }) => {
  await loginAs(page, GREENFIELD_USERS.admin.email)
  await page.goto('/settings/grading')

  const save = page.getByTestId('grading-save')
  await expect(page.getByTestId('band-row')).toHaveCount(6)
  await expect(save).toBeEnabled()

  // Remove "D" (45–49) from the Primary scale
  await page.getByRole('button', { name: 'Remove band D' }).click()

  await expect(page.getByTestId('grading-errors')).toContainText('Gap between 44 and 50: scores 45–49 have no grade')
  await expect(save).toBeDisabled()

  // Discarding the change makes it valid again
  await page.reload()
  await expect(page.getByTestId('band-row')).toHaveCount(6)
  await expect(page.getByTestId('grading-errors')).toHaveCount(0)
  await expect(save).toBeEnabled()
})

test('the assessment split shows its total and can\'t be saved unless it is 100', async ({ page }) => {
  await loginAs(page, GREENFIELD_USERS.admin.email)
  await page.goto('/settings/grading')

  await expect(page.getByTestId('assessment-total')).toHaveText('Total: 100 / 100')

  await page.getByRole('button', { name: 'Remove component 2' }).click()

  await expect(page.getByTestId('assessment-total')).toHaveText('Total: 80 / 100')
  await expect(page.getByTestId('assessment-errors')).toContainText('Total is 80; it must be 100')
  await expect(page.getByTestId('assessment-save')).toBeDisabled()
})

import { expect, test } from '@playwright/test'
import { choose, gotoHydrated, GREENFIELD_USERS, loginAs } from './support/auth'

// Read-only: uses the seeded Greenfield students (about 40 in 2026/2027).

test('admin searches, filters by class and pages through the students', async ({ page }) => {
  await loginAs(page, GREENFIELD_USERS.admin.email)
  await gotoHydrated(page, '/students')
  const table = page.getByTestId('student-table')

  // 25 per page → two pages
  await expect(table.locator('tbody tr')).toHaveCount(25)
  await page.getByTestId('student-pages').getByRole('button', { name: 'Page 2' }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(table.locator('tbody tr').first()).toBeVisible()

  // Search goes back to page 1 and is kept in the URL
  await page.getByTestId('student-search').fill('Chidera')
  await expect(page).toHaveURL(/search=Chidera/)
  await expect(page).not.toHaveURL(/page=/)
  await expect(table.locator('tbody tr')).toHaveCount(1)
  await expect(table).toContainText('Chidera Eze')
  await expect(table).toContainText('JSS 1A')

  // Class filter: JSS 1 → JSS 1B
  await page.getByTestId('student-search').fill('')
  await choose(page, page.getByTestId('student-level'), 'JSS 1')
  await choose(page, page.getByTestId('student-arm'), 'JSS 1B')
  await expect(page).toHaveURL(/classArmId=/)
  await expect(table).toContainText('Aisha Bello')
  await expect(table).not.toContainText('Chidera Eze')

  // The filtered URL survives a reload
  await page.reload()
  await expect(page.getByTestId('student-table')).toContainText('Aisha Bello')
  await expect(page.getByTestId('student-total')).toHaveText('8 students')
})

test('a teacher only sees the students of the arms they teach', async ({ page }) => {
  await loginAs(page, GREENFIELD_USERS.teacher.email)
  await gotoHydrated(page, '/students')

  // Class teacher of JSS 1A, Mathematics in JSS 1A and 1B; Somto Eze is in Primary 3A
  await page.getByTestId('student-search').fill('Eze')
  await expect(page.getByTestId('student-table')).toContainText('Chidera Eze')
  await expect(page.getByTestId('student-table')).not.toContainText('Somto Eze')
  await expect(page.getByTestId('admit-student')).toHaveCount(0)
})

test('the profile shows details and guardians; the bursar doesn\'t see personal details', async ({ page }) => {
  await loginAs(page, GREENFIELD_USERS.bursar.email)
  await gotoHydrated(page, '/students?search=Chidera')
  await page.getByTestId('student-table').getByRole('link', { name: /Chidera Eze/ }).click()

  await expect(page.getByTestId('student-name')).toHaveText('Chidera Eze')
  await expect(page.getByTestId('student-guardian')).toContainText('Ngozi Eze')
  await expect(page.getByText('State of origin')).toHaveCount(0)
  await expect(page.getByTestId('student-actions')).toHaveCount(0)
})

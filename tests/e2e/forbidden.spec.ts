import { expect, test } from '@playwright/test'
import { GREENFIELD_USERS, loginAs } from './support/auth'

test('a teacher opening the admin-only Users page lands on the dashboard with a notice', async ({ page }) => {
  await loginAs(page, GREENFIELD_USERS.teacher.email)

  await page.goto('/users')

  await expect(page).toHaveURL('/')
  // Inside the toast region: the toast also has a hidden screen-reader copy of its text
  await expect(page.getByRole('region', { name: /Notifications/ }).getByText('You don\'t have access to that page')).toBeVisible()
  await expect(page.getByTestId('users-table')).toHaveCount(0)
})

test('the admin can open the Users page', async ({ page }) => {
  await loginAs(page, GREENFIELD_USERS.admin.email)

  await page.goto('/users')

  await expect(page).toHaveURL('/users')
  await expect(page.getByTestId('users-table')).toContainText(GREENFIELD_USERS.teacher.email)
})

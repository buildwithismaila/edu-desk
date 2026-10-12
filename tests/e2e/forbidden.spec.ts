import { expect, test } from '@playwright/test'
import { GREENFIELD_USERS, loginAs } from './support/auth'

test('a teacher opening the Staff page lands on the dashboard with a notice', async ({ page }) => {
  await loginAs(page, GREENFIELD_USERS.teacher.email)

  await page.goto('/staff')

  await expect(page).toHaveURL('/')
  // Inside the toast region: the toast also has a hidden screen-reader copy of its text
  await expect(page.getByRole('region', { name: /Notifications/ }).getByText('You don\'t have access to that page')).toBeVisible()
  await expect(page.getByTestId('staff-table')).toHaveCount(0)
})

test('the old Users address takes the admin to Staff', async ({ page }) => {
  await loginAs(page, GREENFIELD_USERS.admin.email)

  await page.goto('/users')

  await expect(page).toHaveURL('/staff')
  await expect(page.getByTestId('staff-table')).toContainText(GREENFIELD_USERS.teacher.email)
})

for (const path of ['/staff', '/assignments']) {
  test(`a bursar opening ${path} lands on the dashboard with a notice`, async ({ page }) => {
    await loginAs(page, GREENFIELD_USERS.bursar.email)

    await page.goto(path)

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('region', { name: /Notifications/ }).getByText('You don\'t have access to that page')).toBeVisible()
  })
}

test('a teacher opening a school setup page lands on the dashboard with a notice', async ({ page }) => {
  await loginAs(page, GREENFIELD_USERS.teacher.email)

  await page.goto('/settings/classes')

  await expect(page).toHaveURL('/')
  await expect(page.getByRole('region', { name: /Notifications/ }).getByText('You don\'t have access to that page')).toBeVisible()
})

test('a parent opening Students lands on the dashboard with a notice', async ({ page }) => {
  await loginAs(page, GREENFIELD_USERS.parent.email)

  await page.goto('/students')

  await expect(page).toHaveURL('/')
  await expect(page.getByRole('region', { name: /Notifications/ }).getByText('You don\'t have access to that page')).toBeVisible()
  await expect(page.getByTestId('my-children')).toContainText('Chidera Eze')
})

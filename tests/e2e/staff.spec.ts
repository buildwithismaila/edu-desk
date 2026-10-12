import { expect, type Page, test } from '@playwright/test'
import { gotoHydrated, GREENFIELD_USERS, loginAs, logout, submitLogin } from './support/auth'

// Creates its own staff member (unique email per run and project) and removes them at the end.

async function staffAction(page: Page, email: string, action: string) {
  await gotoHydrated(page, '/staff')
  await page.getByTestId(`staff-actions-${email}`).click()
  await page.getByRole('menuitem', { name: action }).click()
}

test('admin adds a teacher who logs in with the temporary password; deactivate, reactivate, remove', async ({ page, isMobile }, testInfo) => {
  // Three logins (real scrypt) and a password change: longer than the default 30s
  test.setTimeout(90_000)
  const email = `e2e-${testInfo.project.name}-${Date.now().toString(36)}@greenfield.test`
  const newPassword = 'my-own-password-123'

  // Add → one-time temporary password
  await loginAs(page, GREENFIELD_USERS.admin.email)
  await gotoHydrated(page, '/staff')
  await page.getByTestId('add-staff').click()
  await page.getByTestId('staff-name').fill('Esther Etim')
  await page.getByTestId('staff-email').fill(email)
  await page.getByTestId('staff-save').click()
  const temporaryPassword = (await page.getByTestId('temp-password').textContent())!.trim()
  expect(temporaryPassword).toHaveLength(10)
  await page.getByTestId('temp-password-done').click()
  await expect(page.getByTestId('staff-table')).toContainText(email)
  await logout(page, isMobile)

  // First login → forced to choose a password
  await page.goto('/login')
  await submitLogin(page, email, temporaryPassword)
  await expect(page).toHaveURL('/account/password')
  await expect(page.getByTestId('change-password-submit')).toBeEnabled()
  await page.getByTestId('current-password').fill(temporaryPassword)
  await page.getByTestId('new-password').fill(newPassword)
  await page.getByTestId('confirm-password').fill(newPassword)
  await page.getByTestId('change-password-submit').click()
  await expect(page).toHaveURL('/')
  await logout(page, isMobile)

  // Deactivate → can't log in
  await loginAs(page, GREENFIELD_USERS.admin.email)
  await staffAction(page, email, 'Deactivate')
  await page.getByTestId('confirm-dialog-confirm').click()
  await expect(page.getByRole('row', { name: new RegExp(email) })).toContainText('Inactive')
  await logout(page, isMobile)
  await page.goto('/login')
  await submitLogin(page, email, newPassword)
  await expect(page.getByTestId('login-error')).toHaveText(/account is disabled/)

  // Reactivate, then remove (cleanup) → gone from the list
  await loginAs(page, GREENFIELD_USERS.admin.email)
  await staffAction(page, email, 'Reactivate')
  await expect(page.getByRole('row', { name: new RegExp(email) })).toContainText('Active')
  await staffAction(page, email, 'Remove')
  await page.getByTestId('confirm-dialog-confirm').click()
  await expect(page.getByTestId('staff-table')).not.toContainText(email)
})

test('a principal sees the staff list without admin actions', async ({ page }) => {
  await loginAs(page, GREENFIELD_USERS.principal.email)
  await gotoHydrated(page, '/staff')

  await expect(page.getByTestId('staff-table')).toContainText(GREENFIELD_USERS.teacher.email)
  await expect(page.getByTestId('add-staff')).toHaveCount(0)
  await expect(page.getByTestId(`staff-actions-${GREENFIELD_USERS.teacher.email}`)).toHaveCount(0)
})

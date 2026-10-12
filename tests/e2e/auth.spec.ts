import { expect, test } from '@playwright/test'
import { DEMO_PASSWORD, GREENFIELD_USERS, INACTIVE_USER, loginAs, openSidebar, submitLogin } from './support/auth'

for (const [role, user] of Object.entries(GREENFIELD_USERS)) {
  test(`${role} logs in, sees only their nav, and logs out`, async ({ page, isMobile }) => {
    await loginAs(page, user.email)
    await expect(page).toHaveURL('/')
    await expect(page.getByTestId('current-user')).toContainText(user.name)

    const sidebar = await openSidebar(page, isMobile)
    await expect(sidebar.getByRole('link', { name: 'Dashboard' })).toBeVisible()
    const manager = role === 'admin' || role === 'principal'
    await expect(sidebar.getByRole('link', { name: 'Staff' })).toHaveCount(manager ? 1 : 0)
    await expect(sidebar.getByRole('link', { name: 'Assignments' })).toHaveCount(manager ? 1 : 0)
    await expect(sidebar.getByRole('link', { name: 'Calendar' })).toHaveCount(role === 'admin' ? 1 : 0)

    await sidebar.getByTestId('user-menu').click()
    await page.getByRole('menuitem', { name: 'Log out' }).click()
    await expect(page).toHaveURL('/login')

    // The session is really gone: protected pages send us back to login
    await page.goto('/')
    await expect(page).toHaveURL('/login?redirect=/')
  })
}

test('a wrong password shows an error and stays on the login page', async ({ page }) => {
  await page.goto('/login')
  await submitLogin(page, GREENFIELD_USERS.principal.email, 'not-the-password')

  await expect(page.getByTestId('login-error')).toHaveText(/Invalid email, phone or password/)
  await expect(page).toHaveURL('/login')
})

test('an inactive user is told their account is disabled', async ({ page }) => {
  await page.goto('/login')
  await submitLogin(page, INACTIVE_USER.email, DEMO_PASSWORD)

  await expect(page.getByTestId('login-error')).toHaveText(/account is disabled/)
})

test('a logged-out visit is sent to login and returns to the page afterwards', async ({ page }) => {
  await page.goto('/staff')
  await expect(page).toHaveURL('/login?redirect=/staff')

  await submitLogin(page, GREENFIELD_USERS.admin.email)

  await expect(page).toHaveURL('/staff')
  await expect(page.getByTestId('staff-table')).toBeVisible()
})

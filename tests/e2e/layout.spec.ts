import { expect, test } from '@playwright/test'
import { GREENFIELD_USERS, loginAs } from './support/auth'

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only layout behaviour')

  test('sidebar is visible and collapses via its toggle', async ({ page }) => {
    await loginAs(page, GREENFIELD_USERS.admin.email)
    const sidebar = page.getByTestId('sidebar')
    await expect(sidebar).toBeVisible()
    await expect(page.getByTestId('school-name')).toBeVisible()
    await expect(page.getByTestId('sidebar-toggle')).toBeHidden()

    await page.getByTestId('sidebar-collapse').click()
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true')
    await expect(page.getByTestId('school-name')).toBeHidden()

    await page.getByTestId('sidebar-collapse').click()
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false')
    await expect(page.getByTestId('school-name')).toBeVisible()
  })
})

test.describe('mobile', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile-only layout behaviour')

  test('sidebar is hidden and opens from the toggle, with no horizontal scroll', async ({ page }) => {
    await loginAs(page, GREENFIELD_USERS.admin.email)
    await expect(page.getByTestId('sidebar')).toBeHidden()

    await page.getByTestId('sidebar-toggle').click()
    const menu = page.getByRole('dialog')
    await expect(menu).toBeVisible()
    await expect(menu.getByTestId('school-name')).toHaveText('Greenfield Academy')
    await expect(menu.getByRole('link', { name: 'Dashboard' })).toBeVisible()

    // String form: tests are type-checked without DOM types
    const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('the login and Users pages fit the screen without horizontal scroll', async ({ page }) => {
    const overflow = () => page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')

    await page.goto('/login')
    await expect(page.getByTestId('login-submit')).toBeVisible()
    expect(await overflow()).toBeLessThanOrEqual(0)

    await loginAs(page, GREENFIELD_USERS.admin.email)
    await page.goto('/users')
    await expect(page.getByTestId('users-table')).toBeVisible()
    expect(await overflow()).toBeLessThanOrEqual(0)
  })
})

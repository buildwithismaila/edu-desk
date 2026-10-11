import { expect, test } from '@playwright/test'

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only layout behaviour')

  test('sidebar is visible and collapses via its toggle', async ({ page }) => {
    await page.goto('/')
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
    await page.goto('/')
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
})

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

  test('the login and Staff pages fit the screen without horizontal scroll', async ({ page }) => {
    const overflow = () => page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')

    await page.goto('/login')
    await expect(page.getByTestId('login-submit')).toBeVisible()
    expect(await overflow()).toBeLessThanOrEqual(0)

    await loginAs(page, GREENFIELD_USERS.admin.email)
    await page.goto('/staff')
    await expect(page.getByTestId('staff-table')).toBeVisible()
    expect(await overflow()).toBeLessThanOrEqual(0)
  })

  test('the school setup pages fit the screen without horizontal scroll', async ({ page }) => {
    const overflow = () => page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    await loginAs(page, GREENFIELD_USERS.admin.email)

    for (const [path, ready] of [
      ['/settings/school', 'profile-save'],
      ['/settings/calendar', 'new-session'],
      ['/settings/classes', 'section-jss'],
      ['/settings/subjects', 'subjects-table'],
      ['/settings/grading', 'grading-save'],
      ['/assignments', 'assignments-save'],
    ] as const) {
      await page.goto(path)
      await expect(page.getByTestId(ready)).toBeVisible()
      expect(await overflow(), path).toBeLessThanOrEqual(0)
    }
  })
  test('the student pages fit the screen without horizontal scroll', async ({ page }) => {
    const overflow = () => page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    await loginAs(page, GREENFIELD_USERS.admin.email)

    for (const [path, ready] of [
      ['/students', 'student-table'],
      ['/students/new', 'admit-save'],
      ['/students/import', 'import-file'],
    ] as const) {
      await page.goto(path)
      await expect(page.getByTestId(ready)).toBeVisible()
      expect(await overflow(), path).toBeLessThanOrEqual(0)
    }

    await page.getByRole('link', { name: 'All students' }).click()
    await page.getByTestId('student-table').getByRole('link').first().click()
    await expect(page.getByTestId('student-name')).toBeVisible()
    expect(await overflow(), 'profile').toBeLessThanOrEqual(0)
  })

  test('the attendance and score pages fit the screen without horizontal scroll', async ({ page }) => {
    const overflow = () => page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    await loginAs(page, GREENFIELD_USERS.admin.email)

    for (const [path, ready] of [
      ['/attendance', 'attendance-arm'],
      ['/attendance/summary', 'summary-arm'],
      ['/scores', 'scores-arm-filter'],
      ['/scores/ratings', 'ratings-arm'],
    ] as const) {
      await page.goto(path)
      await expect(page.getByTestId(ready)).toBeVisible()
      expect(await overflow(), path).toBeLessThanOrEqual(0)
    }
  })
})

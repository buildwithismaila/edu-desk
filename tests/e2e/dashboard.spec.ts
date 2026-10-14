import { expect, type Page, test } from '@playwright/test'
import { gotoHydrated, GREENFIELD_USERS, loginAs } from './support/auth'

const overflow = (page: Page) => page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')

test('the admin sees students, attendance, fees and results, and "collected" matches Collections', async ({ page }) => {
  await loginAs(page, GREENFIELD_USERS.admin.email)

  const stats = page.getByTestId('dashboard-stats')
  await expect(stats).toContainText(/First Term \d{4}\/\d{4}/)
  for (const block of ['stats-students', 'stats-attendance', 'stats-fees', 'stats-results']) await expect(page.getByTestId(block)).toBeVisible()
  await expect(page.getByTestId('stats-students-total')).toHaveText(/^\d+$/)
  await expect(page.getByTestId('stats-results-sheets')).toHaveText(/^\d+ \/ \d+$/)
  expect(await overflow(page)).toBeLessThanOrEqual(0)

  // The fees E2E may record (and reverse) a payment at the same time, so compare both pages again until they agree
  await expect(async () => {
    await gotoHydrated(page, '/')
    const collected = (await page.getByTestId('stats-fees-collected').innerText()).trim()
    await gotoHydrated(page, '/fees/collections')
    await expect(page.getByTestId('collections-collected')).toContainText(collected, { timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
})

test('the bursar sees students and fees, nothing academic', async ({ page }) => {
  await loginAs(page, GREENFIELD_USERS.bursar.email)

  await expect(page.getByTestId('stats-students')).toBeVisible()
  await expect(page.getByTestId('stats-fees')).toBeVisible()
  await expect(page.getByTestId('stats-fees-debtors')).toHaveText(/^\d+ debtors?$/)
  await expect(page.getByTestId('stats-attendance')).toHaveCount(0)
  await expect(page.getByTestId('stats-results')).toHaveCount(0)
  expect(await overflow(page)).toBeLessThanOrEqual(0)
})

test('teachers keep My classes, without the school numbers', async ({ page }) => {
  await loginAs(page, GREENFIELD_USERS.teacher.email)
  await expect(page.getByTestId('my-classes')).toBeVisible()
  await expect(page.getByTestId('dashboard-stats')).toHaveCount(0)
})

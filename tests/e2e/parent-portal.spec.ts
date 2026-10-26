import { expect, type Page, test } from '@playwright/test'
import { gotoHydrated, GREENFIELD_USERS, loginAs, logout, submitLogin } from './support/auth'

// Ngozi Eze (parent@greenfield.test, phone 08031110001) has Chidera (JSS 1A, fees paid) and Somto
// (Primary 3A, published by the seed, fees unpaid, so the result is withheld: Phase 10d). Read-only, so it runs
// on desktop and mobile, except the release journey (desktop only), which withholds the result again after.

const overflow = (page: Page) => page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')

async function loginByPhone(page: Page) {
  await page.goto('/login')
  await submitLogin(page, '08031110001')
  await expect(page.getByTestId('my-children')).toBeVisible()
}

test('a parent sees both children, then Somto\'s withheld result, attendance and fees', async ({ page }) => {
  await loginByPhone(page)

  const children = page.getByTestId('my-children')
  await expect(children.getByRole('link', { name: /Chidera Eze/ })).toBeVisible()
  await expect(children.getByRole('link', { name: /Somto Eze/ })).toBeVisible()
  expect(await overflow(page)).toBeLessThanOrEqual(0)

  // Somto's card: this term's attendance and what's owed
  const somto = children.locator('[data-testid^="my-child-"]').filter({ hasText: 'Somto Eze' }).first()
  await expect(somto.locator('[data-testid^="my-child-attendance-"]')).toHaveText(/^\d+% · absent \d+ days?$/)
  await expect(somto.locator('[data-testid^="my-child-fees-"]')).toHaveText(/^Owing ₦/)
  await expect(somto.locator('[data-testid^="my-child-report-withheld-"]')).toContainText('withheld until fees are paid')

  await children.getByRole('link', { name: /Somto Eze/ }).click()
  await expect(page.getByTestId('child-name')).toHaveText('Somto Eze')

  // Results: the published term is withheld until its fees are paid, with what's owed
  const card = page.locator('[data-testid^="child-result-withheld-"]').first()
  await expect(card).toContainText(/First Term \d{4}\/\d{4}/)
  await expect(card).toContainText(/Withheld until fees are paid\. Outstanding for this term: ₦[\d,]+\.\d\d/)
  expect(await overflow(page)).toBeLessThanOrEqual(0)

  // Attendance
  await page.getByRole('tab', { name: 'Attendance' }).click()
  await expect(page).toHaveURL(/tab=attendance/)
  await expect(page.getByTestId('child-attendance-tiles')).toContainText(/Rate\s*\d+%/)
  expect(await overflow(page)).toBeLessThanOrEqual(0)

  // Fees: unpaid
  await page.getByRole('tab', { name: 'Fees' }).click()
  await expect(page).toHaveURL(/tab=fees/)
  await expect(page.getByTestId('bill-lines')).toContainText('Tuition')
  await expect(page.getByTestId('bill-balance')).toHaveText(/^₦[\d,]+\.\d\d$/)
  await expect(page.getByText('No payments yet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reverse' })).toHaveCount(0)
  expect(await overflow(page)).toBeLessThanOrEqual(0)
})

test('a parent opens a receipt for Chidera\'s payment', async ({ page }) => {
  await loginByPhone(page)
  await page.getByTestId('my-children').getByRole('link', { name: /Chidera Eze/ }).click()
  await expect(page.getByTestId('child-name')).toHaveText('Chidera Eze')

  await page.getByRole('tab', { name: 'Fees' }).click()
  await expect(page.getByTestId('bill-balance')).toHaveText('Fully paid')
  const receiptButton = page.locator('[data-testid^="receipt-RCT"]').first()
  const receiptNumber = (await receiptButton.getAttribute('data-testid'))!.replace('receipt-', '')
  await receiptButton.click()

  await expect(page.getByTestId('receipt-number')).toHaveText(receiptNumber)
  await expect(page.getByTestId('receipt')).toContainText('Chidera Eze')
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  await page.getByRole('link', { name: 'Back to fees' }).click()
  await expect(page).toHaveURL(/tab=fees/)
})

test('a parent can\'t open another family\'s child', async ({ page, isMobile }) => {
  // A real student of another family: Daniel Etim (JSS 1A)
  await loginAs(page, GREENFIELD_USERS.admin.email)
  await gotoHydrated(page, '/students?search=Daniel')
  const href = await page.getByTestId('student-table').getByRole('link', { name: /Daniel Etim/ }).getAttribute('href')
  const danielId = href!.split('/').pop()!
  await logout(page, isMobile)

  await loginByPhone(page)
  await gotoHydrated(page, `/my-children/${danielId}`)
  await expect(page.getByTestId('child-not-found')).toHaveText('Child not found.')
  await expect(page.getByTestId('child-name')).toHaveCount(0)
})

test('the bursar releases Somto\'s withheld result; the parent can then open the report card', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Changes the demo state (restored at the end); the mobile test checks the withheld view')
  test.setTimeout(120_000)
  await loginAs(page, GREENFIELD_USERS.bursar.email)
  await gotoHydrated(page, '/fees/bills?search=Somto')
  await page.getByTestId('bills-table').getByRole('link', { name: 'Somto Eze' }).click()
  await expect(page.getByTestId('fees-student')).toHaveText('Somto Eze')
  const toggle = page.locator('[data-testid^="result-hold-toggle-"]').first()
  await expect(toggle).toHaveText('Release result')
  await toggle.click()
  await expect(toggle).toHaveText('Withhold again')
  const feesUrl = page.url()

  try {
    await logout(page, isMobile)
    await loginByPhone(page)
    await page.getByTestId('my-children').getByRole('link', { name: /Somto Eze/ }).click()
    await page.locator('[data-testid^="child-result-"]:not([data-testid^="child-result-withheld-"])').first().click()
    await expect(page.getByTestId('report-card-name')).toHaveText('Somto Eze')
  }
  finally {
    // Back to the demo state: withheld
    await page.context().clearCookies()
    await loginAs(page, GREENFIELD_USERS.bursar.email)
    await gotoHydrated(page, feesUrl)
    const again = page.locator('[data-testid^="result-hold-toggle-"]').first()
    await expect(again).toHaveText('Withhold again')
    await again.click()
    await expect(again).toHaveText('Release result')
  }
})

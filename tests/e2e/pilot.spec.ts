import { expect, type Page, test } from '@playwright/test'
import { gotoHydrated, GREENFIELD_USERS, loginAs, logout, submitLogin } from './support/auth'

// Pilot readiness (docs/features/10a-pilot-readiness.md): parent logins in bulk, fee invoices, legal pages.
// The seed leaves Somto's Primary 3A classmates' parents without a login.

const overflow = (page: Page) => page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')

test('the admin gives a Primary 3A parent a login slip; the parent logs in with it and sets their own password', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Changes a parent\'s password; the mobile test only checks the layout')
  test.setTimeout(120_000)
  await loginAs(page, GREENFIELD_USERS.admin.email)
  await gotoHydrated(page, '/parent-logins')

  // Filter to Primary 3A, then pick a parent who isn't the demo parent
  await page.getByTestId('filter-class').click()
  await page.getByRole('option', { name: 'Primary 3A' }).click()
  const row = page.getByTestId('parent-logins-list').locator('li').filter({ hasNotText: 'Ngozi Eze' }).first()
  await expect(row).toBeVisible()
  const testId = (await row.getAttribute('data-testid'))!
  const phone = testId.replace('parent-', '')
  await row.getByRole('checkbox').click()
  await page.getByTestId('generate-selected').click()
  await page.getByTestId('confirm-dialog-confirm').click()

  // One slip, with the one-time password
  await expect(page).toHaveURL('/parent-logins/slips')
  await expect(page.getByTestId('login-slip')).toHaveCount(1)
  await expect(page.getByTestId('login-slip')).toContainText(phone)
  const password = (await page.getByTestId('slip-password').innerText()).trim()
  expect(password).toMatch(/^[A-Za-z0-9]{10}$/)

  // The parent logs in with it, must choose their own password, then sees their child
  await page.getByRole('button', { name: 'Done' }).click()
  await logout(page, isMobile)
  await submitLogin(page, phone.replace('+234', '0'), password)
  await expect(page).toHaveURL('/account/password')
  const ownPassword = `Pilot-${Date.now().toString(36)}`
  await page.getByTestId('current-password').fill(password)
  await page.getByTestId('new-password').fill(ownPassword)
  await page.getByTestId('confirm-password').fill(ownPassword)
  await page.getByTestId('change-password-submit').click()
  await expect(page.getByTestId('my-children')).toContainText('Primary 3A')
})

test('the bursar prints Somto\'s invoice and the Primary 3A invoices', async ({ page }) => {
  await loginAs(page, GREENFIELD_USERS.bursar.email)
  await gotoHydrated(page, '/students?search=Somto')
  await page.getByTestId('student-table').getByRole('link', { name: /Somto Eze/ }).click()
  await page.getByTestId('student-fees-link').click()
  await page.getByTestId('invoice-link').click()

  await expect(page.getByTestId('invoice-student')).toHaveText('Somto Eze')
  await expect(page.getByTestId('invoice-balance')).toHaveText(/^₦[\d,]+\.\d\d$/)
  await expect(page.getByTestId('invoice-bank')).toContainText('1012345678')
  await expect(page.getByTestId('invoice-reference')).toContainText('GFA/2026/')
  expect(await overflow(page)).toBeLessThanOrEqual(0)

  await gotoHydrated(page, '/fees/bills')
  await page.getByTestId('bills-table').waitFor()
  await page.getByTestId('bills-arm').click()
  await page.getByRole('option', { name: 'Primary 3A' }).click()
  await page.getByTestId('class-invoices-link').click()
  await expect(page.getByTestId('class-invoices-count')).toContainText('Primary 3A')
  await expect(page.getByTestId('invoice')).toHaveCount(8)
})

test('a parent opens their child\'s invoice from the Fees tab', async ({ page }) => {
  await page.goto('/login')
  await submitLogin(page, '08031110001')
  await page.getByTestId('my-children').getByRole('link', { name: /Somto Eze/ }).click()
  await page.getByRole('tab', { name: 'Fees' }).click()
  await page.getByTestId('child-invoice-link').click()
  await expect(page.getByTestId('invoice-student')).toHaveText('Somto Eze')
  await expect(page.getByTestId('invoice-bank')).toContainText('Zenith Bank')
  expect(await overflow(page)).toBeLessThanOrEqual(0)
})

test('the privacy notice and terms open from the login page without logging in', async ({ page }) => {
  await gotoHydrated(page, '/login')
  await page.getByTestId('legal-links').getByRole('link', { name: 'Privacy' }).click()
  await expect(page.getByTestId('privacy')).toContainText('Privacy notice')
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  await gotoHydrated(page, '/login')
  await page.getByTestId('legal-links').getByRole('link', { name: 'Terms' }).click()
  await expect(page.getByTestId('terms')).toContainText('Terms of use')
})

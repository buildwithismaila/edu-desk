import { expect, test } from '@playwright/test'
import { GREENFIELD_USERS, loginAs, SUNRISE_ADMIN, submitLogin } from './support/auth'
import { schoolUrl } from './support/urls'

test('each subdomain shows its own school on the login page', async ({ page, baseURL }) => {
  const response = await page.goto(schoolUrl(baseURL, 'sunrise', '/login'))
  expect(response?.status()).toBe(200)
  await expect(page.getByTestId('login-school-name')).toHaveText('Sunrise Schools')
  await expect(page.locator('body')).not.toContainText('Greenfield')
})

test('a Greenfield login does not carry over to Sunrise, and Greenfield credentials fail there', async ({ page, baseURL }) => {
  await loginAs(page, GREENFIELD_USERS.admin.email)

  await page.goto(schoolUrl(baseURL, 'sunrise'))
  await expect(page).toHaveURL(schoolUrl(baseURL, 'sunrise', '/login?redirect=/'))

  await submitLogin(page, GREENFIELD_USERS.admin.email)
  await expect(page.getByTestId('login-error')).toHaveText(/Invalid email or password/)

  await submitLogin(page, SUNRISE_ADMIN.email)
  await expect(page.getByTestId('current-user')).toContainText(SUNRISE_ADMIN.name)
  await expect(page.locator('body')).not.toContainText('Greenfield')

  // Still logged in on Greenfield: the two sessions are separate
  await page.goto('/')
  await expect(page.getByTestId('current-user')).toContainText(GREENFIELD_USERS.admin.name)
})

test('an unknown subdomain shows "School not found" with a 404', async ({ page, baseURL }) => {
  const response = await page.goto(schoolUrl(baseURL, 'nope'))
  expect(response?.status()).toBe(404)
  await expect(page.getByTestId('error-not-found')).toBeVisible()
})

test('a suspended school shows "School suspended" with a 403', async ({ page, baseURL }) => {
  const response = await page.goto(schoolUrl(baseURL, 'hillside'))
  expect(response?.status()).toBe(403)
  await expect(page.getByTestId('error-suspended')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Hillside')
})

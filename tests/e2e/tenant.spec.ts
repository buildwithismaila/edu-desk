import { expect, test } from '@playwright/test'
import { schoolUrl } from './support/urls'

test('each subdomain shows its own school', async ({ page, baseURL }) => {
  const response = await page.goto(schoolUrl(baseURL, 'sunrise'))
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome to Sunrise Schools')
  await expect(page.locator('body')).not.toContainText('Greenfield')
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

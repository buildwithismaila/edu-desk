import { expect, test } from '@playwright/test'

test('home page shows the dashboard for the current school', async ({ page, isMobile }) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome to Greenfield Academy')
  // The sidebar (with the school name) is behind the toggle on mobile; layout.spec.ts covers that
  if (!isMobile) await expect(page.getByTestId('school-name')).toHaveText('Greenfield Academy')
})

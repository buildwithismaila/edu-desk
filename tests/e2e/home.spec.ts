import { expect, test } from '@playwright/test'
import { GREENFIELD_USERS, loginAs } from './support/auth'

test('home page shows the dashboard for the current school', async ({ page, isMobile }) => {
  await loginAs(page, GREENFIELD_USERS.admin.email)

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome to Greenfield Academy')
  // The sidebar (with the school name) is behind the toggle on mobile; layout.spec.ts covers that
  if (!isMobile) await expect(page.getByTestId('school-name')).toHaveText('Greenfield Academy')
})

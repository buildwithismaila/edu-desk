import { expect, test } from '@playwright/test'
import { gotoHydrated, GREENFIELD_USERS, loginAs } from './support/auth'

// Changes the school's current term, which every other test relies on, so it runs in its own
// "school-state" project after the desktop and mobile projects (playwright.config.ts).

test('admin makes another session\'s term current, and the top bar follows; then restores it', async ({ page }) => {
  const year = 2100 + Math.floor(Math.random() * 7000)
  const session = `${year}/${year + 1}`
  await loginAs(page, GREENFIELD_USERS.admin.email)
  await gotoHydrated(page, '/settings/calendar')
  await page.getByTestId('new-session').click()
  await page.getByTestId('name-dialog-input').fill(session)
  await page.getByTestId('name-dialog-save').click()
  const card = page.getByTestId(`session-${session}`)
  const firstTerm = card.getByTestId(`term-${session}-first`)
  await expect(firstTerm).toBeVisible()

  try {
    await firstTerm.getByTestId('set-current-term').click()
    await expect(page.getByTestId('current-term')).toHaveText(`${session} · First Term`)
    await expect(firstTerm.getByTestId('current-term-badge')).toBeVisible()
  }
  finally {
    await page.getByTestId('term-2026/2027-first').getByTestId('set-current-term').click()
    await expect(page.getByTestId('current-term')).toHaveText('2026/2027 · First Term')
    await page.getByRole('button', { name: `Delete ${session}` }).click()
    await page.getByTestId('confirm-dialog-confirm').click()
    await expect(card).toHaveCount(0)
  }
})

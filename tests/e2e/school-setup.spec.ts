import { expect, test } from '@playwright/test'
import { gotoHydrated, GREENFIELD_USERS, loginAs } from './support/auth'

// Creates its own session and arm (random names) and deletes them again, so reruns and the parallel
// desktop/mobile projects don't collide. Switching the current term is in current-term.spec.ts, which
// runs on its own after everything else (every other test relies on the current term).

test('admin creates a session, sets its first term\'s dates and adds an arm', async ({ page }) => {
  const year = 2100 + Math.floor(Math.random() * 7000)
  const session = `${year}/${year + 1}`
  const arm = `E${Date.now().toString(36).slice(-6)}`

  await loginAs(page, GREENFIELD_USERS.admin.email)

  // New session → its three terms appear
  await gotoHydrated(page, '/settings/calendar')
  await page.getByTestId('new-session').click()
  await page.getByTestId('name-dialog-input').fill(session)
  await page.getByTestId('name-dialog-save').click()
  const card = page.getByTestId(`session-${session}`)
  await expect(card).toBeVisible()
  await expect(card.getByTestId(`term-${session}-third`)).toBeVisible()

  // First term dates
  const firstTerm = card.getByTestId(`term-${session}-first`)
  await firstTerm.getByTestId('edit-term-dates').click()
  await page.getByTestId('term-starts-on').fill(`${year}-09-14`)
  await page.getByTestId('term-ends-on').fill(`${year}-12-18`)
  await page.getByTestId('term-next-begins-on').fill(`${year + 1}-01-11`)
  await page.getByTestId('term-dates-save').click()
  await expect(firstTerm).toContainText(`14/09/${year} – 18/12/${year}`)
  await expect(firstTerm).toContainText(`Next term begins 11/01/${year + 1}`)

  // Clean up the session
  await page.getByRole('button', { name: `Delete ${session}` }).click()
  await page.getByTestId('confirm-dialog-confirm').click()
  await expect(card).toHaveCount(0)

  // New arm on JSS 3 → listed with its label; then delete it
  await gotoHydrated(page, '/settings/classes')
  await page.getByTestId('add-arm-JSS 3').click()
  await page.getByTestId('name-dialog-input').fill(arm)
  await page.getByTestId('name-dialog-save').click()
  const armButton = page.getByTestId(`arm-JSS 3 ${arm}`)
  await expect(armButton).toBeVisible()

  await armButton.click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByTestId('confirm-dialog-confirm').click()
  await expect(armButton).toHaveCount(0)
})

test('a session name in the wrong format is rejected in the dialog', async ({ page }) => {
  await loginAs(page, GREENFIELD_USERS.admin.email)
  await gotoHydrated(page, '/settings/calendar')

  await page.getByTestId('new-session').click()
  await page.getByTestId('name-dialog-input').fill('2026-2027')
  await page.getByTestId('name-dialog-save').click()

  await expect(page.getByText('Use the format 2026/2027 (consecutive years)')).toBeVisible()
  await expect(page.getByTestId('session-2026-2027')).toHaveCount(0)
})

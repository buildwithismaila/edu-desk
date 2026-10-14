import { expect, type Page, test } from '@playwright/test'
import { apiFromPage, gotoHydrated, GREENFIELD_USERS, loginAs } from './support/auth'

// Nursery 1A (6 students) is promoted into Nursery 2A for 2027/2028 (the seed's next session), then undone,
// so the run is repeatable. Desktop only writes; the mobile test checks the layout.

const overflow = (page: Page) => page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')

async function openNursery1A(page: Page) {
  await gotoHydrated(page, '/promotion')
  await expect(page.getByTestId('promotion-sessions')).toHaveText('2026/2027 → 2027/2028')
  await page.getByTestId('promotion-arm-Nursery 1A').click()
  await expect(page.getByTestId('promotion-arm-title')).toHaveText('Nursery 1A')
}

test('the admin promotes Nursery 1A with a repeat and a withdrawal, then undoes it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Writes promotions; the mobile test only checks the layout')
  test.setTimeout(120_000)
  await loginAs(page, GREENFIELD_USERS.admin.email)
  // A failed earlier run may have left Nursery 1A promoted
  const list = await apiFromPage<{ arms: { id: string, label: string, promotion: unknown }[] }>(page, 'GET', '/api/promotion')
  const arm = list.arms.find(a => a.label === 'Nursery 1A')!
  if (arm.promotion) await apiFromPage(page, 'DELETE', `/api/promotion/${arm.id}`)

  await openNursery1A(page)
  const rows = page.getByTestId('promotion-rows').locator('li')
  await expect(rows).toHaveCount(6)
  await expect(page.getByTestId('promotion-summary')).toHaveText('6 promoted')

  // Second student repeats (stays in Nursery 1A), third is withdrawn
  const choose = async (row: number, option: string) => {
    await rows.nth(row).getByTestId('promotion-outcome-select').click()
    await page.getByRole('option', { name: option }).click()
  }
  await choose(1, 'Repeat')
  await choose(2, 'Withdraw')
  await expect(page.getByTestId('promotion-summary')).toHaveText('4 promoted · 1 repeating · 1 withdrawn')
  const repeater = (await rows.nth(1).locator('p').first().innerText()).trim()
  const promoted = (await rows.nth(0).locator('p').first().innerText()).trim()

  await page.getByTestId('promotion-confirm').click()
  await page.getByTestId('confirm-dialog-confirm').click()
  await expect(page.getByTestId('promotion-done')).toContainText('Promoted')
  await expect(page.getByTestId('promotion-confirm')).toHaveCount(0)
  await expect(page.getByTestId('promotion-outcome')).toHaveText([
    'Promote → Nursery 2A', 'Repeat → Nursery 1A', 'Withdraw', 'Promote → Nursery 2A', 'Promote → Nursery 2A', 'Promote → Nursery 2A',
  ])

  // The list shows it as promoted; profiles show the outcome
  await gotoHydrated(page, '/promotion')
  await expect(page.getByTestId('promotion-arm-Nursery 1A')).toContainText('Promoted')
  await gotoHydrated(page, `/students?search=${encodeURIComponent(promoted)}`)
  await page.getByTestId('student-table').getByRole('link', { name: new RegExp(promoted) }).click()
  await expect(page.getByTestId('student-promotion')).toHaveText('Promoted to Nursery 2A (after 2026/2027)')
  await gotoHydrated(page, `/students?search=${encodeURIComponent(repeater)}`)
  await page.getByTestId('student-table').getByRole('link', { name: new RegExp(repeater) }).click()
  await expect(page.getByTestId('student-promotion')).toHaveText('Repeating in Nursery 1A (after 2026/2027)')

  // Undo puts it back
  await openNursery1A(page)
  await page.getByTestId('promotion-undo').click()
  await page.getByTestId('confirm-dialog-confirm').click()
  await expect(page.getByTestId('promotion-confirm')).toBeVisible()
  await expect(page.getByTestId('promotion-summary')).toHaveText('6 promoted')
})

test('on a phone, the promotion pages fit the screen', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Layout check for the 375px screen')
  await loginAs(page, GREENFIELD_USERS.admin.email)
  await gotoHydrated(page, '/promotion')
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  await page.getByTestId('promotion-arm-SSS 3A').click()
  await expect(page.getByTestId('promotion-arm-title')).toHaveText('SSS 3A')
  // The last class graduates by default
  await expect(page.getByTestId('promotion-summary')).toHaveText('3 graduating')
  expect(await overflow(page)).toBeLessThanOrEqual(0)
})

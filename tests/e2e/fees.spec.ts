import { expect, type Page, test } from '@playwright/test'
import { gotoHydrated, GREENFIELD_USERS, loginAs } from './support/auth'

// Daniel Etim (JSS 1A) has an unpaid demo bill. The desktop test records a part payment and then
// reverses it, so his balance is unchanged afterwards (the reversed payment stays as the audit trail).

async function openDanielsFees(page: Page) {
  await gotoHydrated(page, '/fees/bills')
  await page.getByTestId('bills-search').fill('Daniel')
  await page.getByTestId('bills-table').getByRole('link', { name: 'Daniel Etim' }).click()
  await expect(page.getByTestId('fees-student')).toHaveText('Daniel Etim')
}

const naira = (text: string) => Math.round(Number(text.replace(/[₦,]/g, '')) * 100)

test('the bursar records a part payment, prints the receipt, reverses it, and sees the debtor', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Writes payments; the mobile test only checks the layout')
  test.setTimeout(120_000)
  const reference = `E2E-${Date.now().toString(36)}`

  await loginAs(page, GREENFIELD_USERS.bursar.email)
  await openDanielsFees(page)
  const balance = page.getByTestId('bill-balance')
  const before = naira(await balance.innerText())
  expect(before).toBeGreaterThan(1_000_000)

  // Record ₦10,000 → the receipt opens in a new tab
  await page.getByTestId('record-payment').click()
  await page.getByTestId('payment-amount').locator('input').fill('10,000')
  await page.getByTestId('payment-reference').fill(reference)
  const receiptTab = page.waitForEvent('popup')
  await page.getByTestId('payment-save').click()
  const receipt = await receiptTab
  await expect(receipt.getByTestId('receipt-amount')).toHaveText('₦10,000.00')
  const receiptNumber = (await receipt.getByTestId('receipt-number').innerText()).trim()
  expect(receiptNumber).toMatch(/^RCT\/\d{4}\/\d{6}$/)
  await expect(receipt.getByTestId('receipt')).toContainText(reference)
  // Printing hides the toolbar
  await receipt.emulateMedia({ media: 'print' })
  await expect(receipt.getByTestId('print')).toBeHidden()
  await receipt.close()
  // The receipt tab opened while the payment dialog was closing; in a background tab its fade-out can stall
  // and leave the overlay over the page, so come back to the front and let it finish
  await page.bringToFront()
  await expect(page.locator('[data-slot="overlay"]')).toHaveCount(0)

  await expect(balance).toHaveText(new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format((before - 1_000_000) / 100))

  // Reverse it with a reason → the balance is back, the receipt says REVERSED
  await page.getByTestId(`reverse-${receiptNumber}`).click()
  await page.getByTestId('name-dialog-input').fill('Recorded against the wrong student (E2E)')
  await page.getByTestId('name-dialog-save').click()
  await expect(page.getByTestId(`payment-${receiptNumber}`)).toContainText('Reversed')
  expect(naira(await balance.innerText())).toBe(before)

  const reversedTab = page.waitForEvent('popup')
  await page.getByTestId(`receipt-${receiptNumber}`).click()
  const reversed = await reversedTab
  await expect(reversed.getByTestId('receipt-reversed')).toContainText('Recorded against the wrong student (E2E)')
  await reversed.close()

  // Still on the debtors list
  await gotoHydrated(page, '/fees/debtors')
  await expect(page.getByTestId('debtors-table')).toContainText('Daniel Etim')
})

test('on a phone, a student\'s fees and the payment form fit the screen', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile layout')
  const overflow = () => page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  await loginAs(page, GREENFIELD_USERS.bursar.email)
  await openDanielsFees(page)
  expect(await overflow()).toBeLessThanOrEqual(0)

  await page.getByTestId('record-payment').click()
  await expect(page.getByTestId('payment-save')).toBeVisible()
  expect(await overflow()).toBeLessThanOrEqual(0)
  await page.getByRole('button', { name: 'Cancel' }).click()
})

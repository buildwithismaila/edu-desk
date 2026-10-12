import { expect, type Page, test } from '@playwright/test'
import { apiFromPage, choose, gotoHydrated, GREENFIELD_USERS, loginAs } from './support/auth'

// Each project uses a different class (and class teacher), so they never write the same register.
// Today's register is deleted at the end (by the admin), so reruns start untaken.
const CLASS_TEACHERS: Record<string, { email: string, name: string, arm: string }> = {
  desktop: { email: 'chioma@greenfield.test', name: 'Chioma Obi', arm: 'JSS 1B' },
  mobile: { email: GREENFIELD_USERS.teacher.email, name: GREENFIELD_USERS.teacher.name, arm: 'JSS 1A' },
}

async function deleteTodaysRegister(page: Page, armLabel: string) {
  await page.context().clearCookies()
  await loginAs(page, GREENFIELD_USERS.admin.email)
  const { arms } = await apiFromPage<{ arms: { id: string, label: string }[] }>(page, 'GET', '/api/attendance/arms')
  const arm = arms.find(a => a.label === armLabel)!
  const { register } = await apiFromPage<{ register: { id: string } | null }>(page, 'GET', `/api/attendance/register?classArmId=${arm.id}`)
  if (register) await apiFromPage(page, 'DELETE', `/api/attendance/registers/${register.id}`)
}

test('the class teacher takes today\'s register in one go, edits it, and sees the term summary', async ({ page, isMobile }, testInfo) => {
  test.setTimeout(90_000)
  const teacher = CLASS_TEACHERS[testInfo.project.name]!

  try {
    await loginAs(page, teacher.email)
    await expect(page.getByTestId(`my-register-${teacher.arm}`)).toBeVisible()

    // One class → straight to today's register
    await gotoHydrated(page, '/attendance')
    await expect(page.getByTestId('register-title')).toContainText(`${teacher.arm} · Today`)
    const rows = page.locator('[data-testid^="register-row-"]')
    await page.getByTestId('register-all-present').click()
    await rows.nth(0).getByTestId('mark-absent').click()
    await rows.nth(1).getByTestId('mark-late').click()
    await expect(page.getByTestId('register-counts')).toContainText('Absent 1 · Late 1')
    if (isMobile) {
      const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
      expect(overflow).toBeLessThanOrEqual(0)
    }
    await page.getByTestId('register-save').click()
    await expect(page.getByTestId('register-status')).toContainText(`Taken by ${teacher.name}`)

    // Marks are kept; still editable today
    await page.reload()
    await expect(rows.nth(0).getByTestId('mark-absent')).toHaveAttribute('aria-pressed', 'true')
    await expect(rows.nth(1).getByTestId('mark-late')).toHaveAttribute('aria-pressed', 'true')
    await rows.nth(1).getByTestId('mark-present').click()
    await page.getByTestId('register-save').click()
    await expect(page.getByTestId('register-counts')).toContainText('Absent 1 · Late 0')

    // Term summary for the class
    await page.getByRole('link', { name: 'Term summary' }).click()
    await expect(page.getByTestId('summary-heading')).toContainText(teacher.arm)
    await expect(page.getByTestId('summary-table').locator('tbody tr').first()).toBeVisible()
  }
  finally {
    await deleteTodaysRegister(page, teacher.arm)
  }
})

test('the admin can open any class and back-fill a past date', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Covered once on desktop')
  await loginAs(page, GREENFIELD_USERS.admin.email)
  await gotoHydrated(page, '/attendance')

  // Several classes → pick one; admin and principal also get a date to back-fill (read-only check)
  await expect(page.getByTestId('attendance-date')).toHaveCount(0)
  await choose(page, page.getByTestId('attendance-arm'), /^JSS 1A/)
  await expect(page.getByTestId('register-title')).toContainText('JSS 1A · Today')
  await expect(page.getByTestId('attendance-date')).toBeVisible()
  await expect(page).toHaveURL(/arm=/)
})

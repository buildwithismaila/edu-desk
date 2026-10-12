import { expect, test } from '@playwright/test'
import { choose, gotoHydrated, GREENFIELD_USERS, loginAs, logout, submitLogin } from './support/auth'

// Admits its own student (unique name and guardian phone per run and project) and removes them at the end.

test('admin admits a student with a new guardian, who logs in by phone and sees the child', async ({ page, isMobile }, testInfo) => {
  // Three logins (real scrypt) and a password change
  test.setTimeout(120_000)
  const lastName = `Testa${Date.now().toString(36)}`
  // 0809… on desktop, 0808… on mobile: never the same phone in parallel projects
  const phone = `080${testInfo.project.name === 'desktop' ? 9 : 8}${String(Date.now()).slice(-7)}`
  const newPassword = 'my-own-password-123'

  // Admit → the new guardian's one-time temporary password → profile
  await loginAs(page, GREENFIELD_USERS.admin.email)
  await gotoHydrated(page, '/students/new')
  await page.getByTestId('student-first-name').fill('Kamsi')
  await page.getByTestId('student-last-name').fill(lastName)
  await choose(page, page.getByTestId('student-gender-select'), 'Female')
  await choose(page, page.getByTestId('student-class'), 'JSS 2A')
  await page.getByTestId('guardian-mode-new').click()
  await page.getByTestId('new-guardian-name').fill(`Ada ${lastName}`)
  await page.getByTestId('new-guardian-phone').fill(phone)
  await page.getByTestId('new-guardian-add').click()
  await expect(page.getByTestId('picked-guardian')).toContainText(`Ada ${lastName}`)
  await page.getByTestId('admit-save').click()

  const temporaryPassword = (await page.getByTestId('temp-password').textContent())!.trim()
  expect(temporaryPassword).toHaveLength(10)
  await page.getByTestId('temp-password-done').click()
  await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}$/)
  const profileUrl = page.url()
  await expect(page.getByTestId('student-name')).toHaveText(`Kamsi ${lastName}`)
  await expect(page.getByTestId('student-class-label')).toHaveText('JSS 2A')
  await expect(page.getByTestId('student-guardian')).toContainText(`Ada ${lastName}`)
  await logout(page, isMobile)

  // The parent logs in with the phone number → must choose a password → sees the child
  await page.goto('/login')
  await submitLogin(page, phone, temporaryPassword)
  await expect(page).toHaveURL('/account/password')
  await expect(page.getByTestId('change-password-submit')).toBeEnabled()
  await page.getByTestId('current-password').fill(temporaryPassword)
  await page.getByTestId('new-password').fill(newPassword)
  await page.getByTestId('confirm-password').fill(newPassword)
  await page.getByTestId('change-password-submit').click()
  await expect(page).toHaveURL('/')
  await expect(page.getByTestId('my-children')).toContainText(`Kamsi ${lastName}`)
  await expect(page.getByTestId('my-children')).toContainText('JSS 2A')
  await logout(page, isMobile)

  // Cleanup: the admin removes the student → gone from the list
  await loginAs(page, GREENFIELD_USERS.admin.email)
  await gotoHydrated(page, profileUrl)
  await page.getByTestId('student-actions').click()
  await page.getByRole('menuitem', { name: 'Remove student' }).click()
  await page.getByTestId('confirm-dialog-confirm').click()
  await expect(page).toHaveURL('/students')
  await page.getByTestId('student-search').fill(lastName)
  await expect(page.getByTestId('student-total')).toHaveText('0 students')
})

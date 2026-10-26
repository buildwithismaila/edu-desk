import { type Browser, expect, type Page, test } from '@playwright/test'
import { apiFromPage, DEMO_PASSWORD, GREENFIELD_USERS, gotoHydrated, loginAs, submitLogin } from './support/auth'

// Registers taken with no connection (docs/features/10c-offline-attendance.md), on the phone only (the mobile
// project; playwright.config.ts). Primary 3A's class teacher, so attendance.spec.ts's classes are never touched;
// the tests run in order, as both write today's register (deleted after each).
const teacher = { email: 'grace@greenfield.test', name: 'Grace Ekpo', arm: 'Primary 3A' }

test.describe.configure({ mode: 'serial' })
// Service workers need a secure origin; the E2E server is plain http on *.lvh.me (production is https). Only the
// full Chromium (not the default headless shell) honours the flag that treats it as secure.
test.use({ channel: 'chromium', launchOptions: { args: ['--host-resolver-rules=MAP *.lvh.me 127.0.0.1', '--unsafely-treat-insecure-origin-as-secure=http://greenfield.lvh.me:3100'] } })

/** Logs in online, opens Attendance with the service worker in control, and waits until the class is saved on the phone. */
async function openAttendanceOnline(page: Page, email: string) {
  await loginAs(page, email)
  await gotoHydrated(page, '/attendance')
  await page.waitForFunction('navigator.serviceWorker.ready.then(() => true)')
  // Load once more through the service worker, so this page is kept for offline use
  await gotoHydrated(page, '/attendance')
  await expect.poll(() => page.evaluate<number>(`new Promise((resolve) => {
    const open = indexedDB.open('edu-desk-offline')
    open.onsuccess = () => {
      const keys = open.result.transaction('kv').objectStore('kv').getAllKeys()
      keys.onsuccess = () => resolve(keys.result.filter(k => String(k).includes('|roster|')).length)
    }
    open.onerror = () => resolve(0)
  })`), { timeout: 15_000 }).toBeGreaterThan(0)
}

/** The admin, in a browser of their own: today's register for the class (to change it at school, or clean up). */
async function asAdmin<T>(browser: Browser, baseURL: string, armLabel: string, run: (page: Page, armId: string, register: { id: string, version: number } | null) => Promise<T>) {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  try {
    await page.goto('/login')
    await submitLogin(page, GREENFIELD_USERS.admin.email, DEMO_PASSWORD)
    await expect(page.getByTestId('current-user')).toBeVisible()
    const { arms } = await apiFromPage<{ arms: { id: string, label: string }[] }>(page, 'GET', '/api/attendance/arms')
    const arm = arms.find(a => a.label === armLabel)!
    const { register } = await apiFromPage<{ register: { id: string, version: number } | null }>(page, 'GET', `/api/attendance/register?classArmId=${arm.id}`)
    return await run(page, arm.id, register)
  }
  finally {
    await context.close()
  }
}

const deleteTodaysRegister = (browser: Browser, baseURL: string, armLabel: string) => asAdmin(browser, baseURL, armLabel, async (page, _armId, register) => {
  if (register) await apiFromPage(page, 'DELETE', `/api/attendance/registers/${register.id}`)
})

test('the class teacher takes the register with no signal, and it sends itself when back online', async ({ page, context, browser, baseURL }) => {
  test.setTimeout(120_000)
  try {
    await openAttendanceOnline(page, teacher.email)

    // No signal: the page still opens, from the phone
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByTestId('offline-banner')).toBeVisible()
    await expect(page.getByTestId('register-title')).toContainText(`${teacher.arm} · Today`)
    const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    expect(overflow).toBeLessThanOrEqual(0)

    const rows = page.locator('[data-testid^="register-row-"]')
    await page.getByTestId('register-all-present').click()
    await rows.nth(0).getByTestId('mark-absent').click()
    await page.getByTestId('register-save').click()
    await expect(page.getByText('Saved on this phone. It will send when you\'re online.', { exact: true })).toBeVisible()
    await expect(page.getByTestId('outbox-waiting')).toBeVisible()
    await expect(page.getByTestId('register-status')).toHaveText('Saved on this phone · waiting to send')

    // Back online: sent without the teacher doing anything
    await context.setOffline(false)
    await expect(page.getByTestId('outbox-sent')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('offline-banner')).toBeHidden()
    await expect(page.getByTestId('register-status')).toContainText(`Taken by ${teacher.name}`)
    await expect(page.getByTestId('register-counts')).toContainText('Absent 1')
  }
  finally {
    await deleteTodaysRegister(browser, baseURL!, teacher.arm)
  }
})

test('a register changed at school meanwhile is never overwritten: the teacher sees both and chooses', async ({ page, context, browser, baseURL }) => {
  test.setTimeout(120_000)
  try {
    await openAttendanceOnline(page, teacher.email)
    await context.setOffline(true)
    await page.reload()
    await page.locator('[data-testid^="register-row-"]').nth(0).getByTestId('mark-late').click()
    await page.getByTestId('register-save').click()
    await expect(page.getByTestId('outbox-waiting')).toBeVisible()

    // Meanwhile the admin takes the same register at school (everyone present)
    await asAdmin(browser, baseURL!, teacher.arm, async (admin, armId) => {
      const { students } = await apiFromPage<{ students: { id: string }[] }>(admin, 'GET', `/api/attendance/register?classArmId=${armId}`)
      await apiFromPage(admin, 'PUT', '/api/attendance/register', { classArmId: armId, date: await admin.evaluate<string>('new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date())'), marks: students.map(s => ({ studentId: s.id, status: 'present' })) })
    })

    await context.setOffline(false)
    const conflict = page.getByTestId('outbox-conflict')
    await expect(conflict).toBeVisible({ timeout: 20_000 })
    await expect(conflict).toContainText('Yours')
    await expect(conflict).toContainText('Late 1')
    await expect(conflict).toContainText('School\'s')
    await expect(conflict).toContainText('Late 0')

    // The school's copy stays; the phone's is dropped
    await conflict.getByTestId('outbox-keep-school').click()
    await expect(page.getByTestId('outbox')).toBeHidden()
    await expect(page.getByTestId('register-counts')).toContainText('Late 0')
  }
  finally {
    await deleteTodaysRegister(browser, baseURL!, teacher.arm)
  }
})

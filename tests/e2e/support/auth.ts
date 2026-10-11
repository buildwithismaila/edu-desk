import { expect, type Page } from '@playwright/test'

/** Seeded demo users (server/database/seed/seed.ts); all use DEMO_PASSWORD. */
export const DEMO_PASSWORD = 'password123'

export const GREENFIELD_USERS = {
  admin: { email: 'admin@greenfield.test', name: 'Adaeze Okafor' },
  principal: { email: 'principal@greenfield.test', name: 'Emeka Nwosu' },
  bursar: { email: 'bursar@greenfield.test', name: 'Fatima Bello' },
  teacher: { email: 'teacher@greenfield.test', name: 'Tunde Adeyemi' },
  parent: { email: 'parent@greenfield.test', name: 'Ngozi Eze' },
} as const

export const INACTIVE_USER = { email: 'inactive@greenfield.test' }
export const SUNRISE_ADMIN = { email: 'admin@sunrise.test', name: 'Bola Ogunleye' }

/** Fills and submits the login form on the current page (waits for hydration via the enabled button). */
export async function submitLogin(page: Page, email: string, password = DEMO_PASSWORD) {
  const submit = page.getByTestId('login-submit')
  await expect(submit).toBeEnabled()
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await submit.click()
}

/** Logs in through the UI at `url` (default: this school's /login) and waits for the dashboard. */
export async function loginAs(page: Page, email: string, url = '/login') {
  await page.goto(url)
  await submitLogin(page, email)
  await expect(page.getByTestId('current-user')).toBeVisible()
}

/** The sidebar: inline on desktop, opened from the toggle on mobile. */
export async function openSidebar(page: Page, isMobile: boolean) {
  if (!isMobile) return page.getByTestId('sidebar')
  await page.getByTestId('sidebar-toggle').click()
  const menu = page.getByRole('dialog')
  await expect(menu).toBeVisible()
  return menu
}

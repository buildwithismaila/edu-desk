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
  const menu = page.getByRole('dialog')
  // The slide-over closes itself on route changes, so a tap during a just-finished navigation can be
  // undone; tap again until its content is really there
  await expect(async () => {
    if (!await menu.isVisible()) await page.getByTestId('sidebar-toggle').click()
    await expect(menu.getByTestId('user-menu')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
  return menu
}

/** Logs out through the user menu (inside the slide-over on mobile). */
export async function logout(page: Page, isMobile: boolean) {
  const sidebar = await openSidebar(page, isMobile)
  await sidebar.getByTestId('user-menu').click()
  await page.getByRole('menuitem', { name: 'Log out' }).click()
  await expect(page).toHaveURL('/login')
}

/** Picks an option in a Nuxt UI USelect. */
export async function choose(page: Page, select: ReturnType<Page['getByTestId']>, option: string | RegExp) {
  await select.click()
  await page.getByRole('option', { name: option }).click()
}

/**
 * Navigates and waits until Vue has hydrated the page. Pages are server-rendered, so buttons are
 * visible (and clickable) before their handlers exist; a click that early does nothing.
 */
export async function gotoHydrated(page: Page, path: string) {
  await page.goto(path)
  // String form: tests are type-checked without DOM types
  await page.waitForFunction('!!document.querySelector("#__nuxt")?.__vue_app__')
}

/**
 * Calls our API from inside the page, so it uses the page's session cookie and Chromium's
 * `*.lvh.me → 127.0.0.1` mapping. (`page.request` runs in Node and would need public DNS.)
 */
export async function apiFromPage<T = unknown>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  return page.evaluate(async ([method, path, body]) => {
    const res = await fetch(path as string, {
      method: method as string,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`)
    return res.json()
  }, [method, path, body] as const) as Promise<T>
}

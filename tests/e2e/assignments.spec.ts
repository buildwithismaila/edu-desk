import { expect, type Page, test } from '@playwright/test'
import { apiFromPage, choose, gotoHydrated, GREENFIELD_USERS, loginAs, logout } from './support/auth'

// Desktop and mobile run in parallel against one database, so each project uses its own arm.
// Ibrahim is seeded without assignments; the test clears what it assigned at the end.
const IBRAHIM = { email: 'ibrahim@greenfield.test', name: 'Ibrahim Sani' }

type Arms = { arms: { classArmId: string, label: string, subjects: { subjectId: string, name: string }[] }[] }

/** Clears the arm's class teacher and Mathematics teacher (needs an admin session in `page`). */
async function clearArm(page: Page, label: string) {
  const { arms } = await apiFromPage<Arms>(page, 'GET', '/api/assignments')
  const target = arms.find(a => a.label === label)!
  const maths = target.subjects.find(s => s.name === 'Mathematics')!
  await apiFromPage(page, 'PUT', `/api/class-arms/${target.classArmId}/class-teacher`, { userId: null })
  await apiFromPage(page, 'PUT', `/api/class-arms/${target.classArmId}/subject-teachers`, { assignments: [{ subjectId: maths.subjectId, userId: null }] })
}

test('admin assigns a class teacher and a subject teacher; the teacher sees them in My classes', async ({ page, isMobile }) => {
  // Three logins (real scrypt): longer than the default 30s
  test.setTimeout(90_000)
  const arm = isMobile ? 'JSS 2B' : 'JSS 2A'

  await loginAs(page, GREENFIELD_USERS.admin.email)
  // Start clean too: a run that crashed before its cleanup must not leave the arm assigned (Save would stay disabled)
  await clearArm(page, arm)
  await gotoHydrated(page, '/assignments')
  if (isMobile) await choose(page, page.getByTestId('arm-select'), new RegExp(`^${arm}`))
  else await page.getByTestId(`arm-${arm}`).click()
  await expect(page.getByRole('heading', { name: arm })).toBeVisible()

  await choose(page, page.getByTestId('class-teacher-select'), IBRAHIM.name)
  await choose(page, page.getByTestId('subject-teacher-Mathematics'), IBRAHIM.name)
  await page.getByTestId('assignments-save').click()
  await expect(page.getByRole('region', { name: /Notifications/ }).getByText(`${arm} assignments saved`)).toBeVisible()

  try {
    await logout(page, isMobile)
    await loginAs(page, IBRAHIM.email)
    await expect(page.getByTestId(`my-class-teacher-${arm}`)).toBeVisible()
    await expect(page.getByTestId(`my-subject-Mathematics-${arm}`)).toHaveText(`Mathematics — ${arm}`)
    await logout(page, isMobile)
  }
  finally {
    // Clean up through the API so a failed assertion still leaves the seed's assignments as they were
    await loginAs(page, GREENFIELD_USERS.admin.email)
    await clearArm(page, arm)
  }
})

test('a principal can manage assignments too', async ({ page }) => {
  await loginAs(page, GREENFIELD_USERS.principal.email)
  await gotoHydrated(page, '/assignments')

  await expect(page.getByTestId('class-teacher-select')).toBeVisible()
  await expect(page.getByTestId('assignments-save')).toBeDisabled()
})

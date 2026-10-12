import { expect, type Page, test } from '@playwright/test'
import { apiFromPage, gotoHydrated, GREENFIELD_USERS, loginAs } from './support/auth'

// Desktop only: writes students. Imported students are removed at the end.
test.skip(({ isMobile }) => isMobile, 'Writes data; covered once on desktop')

const HEADER = 'firstName,lastName,gender,classArm,guardianName,guardianPhone'

async function upload(page: Page, csv: string) {
  await page.locator('input[type=file]').setInputFiles({ name: 'students.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
}

test('a file with a bad row imports nothing; the fixed file imports every student', async ({ page }) => {
  test.setTimeout(90_000)
  const lastName = `Testi${Date.now().toString(36)}`
  const phone = `0807${String(Date.now()).slice(-7)}`
  const good = `Ngozi,${lastName},F,JSS 2A,Parent ${lastName},${phone}`
  const sibling = `Obi,${lastName},M,JSS 2B,Parent ${lastName},${phone}`

  await loginAs(page, GREENFIELD_USERS.admin.email)
  try {
    await gotoHydrated(page, '/students/import')

    // One bad row → the problem is listed and nothing can be imported
    await upload(page, [HEADER, good, `Bad,${lastName},F,JSS 9Z,Parent ${lastName},${phone}`].join('\n'))
    await expect(page.getByTestId('import-problems')).toContainText('1 problem in the file')
    await expect(page.getByTestId('import-errors')).toContainText('No class arm called "JSS 9Z"')
    await expect(page.getByTestId('import-confirm')).toBeDisabled()

    // Fixed file → ready → import → the students are in the list
    await upload(page, [HEADER, good, sibling].join('\n'))
    await expect(page.getByTestId('import-ready')).toContainText('2 students are ready to import')
    await page.getByTestId('import-confirm').click()
    await expect(page).toHaveURL('/students')
    await page.getByTestId('student-search').fill(lastName)
    await expect(page.getByTestId('student-total')).toHaveText('2 students')
  }
  finally {
    // Cleanup through the API, even after a failed assertion
    const { items } = await apiFromPage<{ items: { id: string }[] }>(page, 'GET', `/api/students?search=${lastName}`)
    for (const { id } of items) await apiFromPage(page, 'DELETE', `/api/students/${id}`)
  }
})

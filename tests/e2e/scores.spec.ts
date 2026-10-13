import { expect, type Page, test } from '@playwright/test'
import { apiFromPage, choose, gotoHydrated, GREENFIELD_USERS, loginAs } from './support/auth'

// Desktop writes JSS 1B Mathematics (half seeded) and locks/unlocks JSS 1B; mobile edits one JSS 1A
// cell and restores it. Everything is undone at the end.

type Sheet = { term: { id: string }, arm: { id: string }, subject: { id: string }, components: { id: string }[], students: { id: string, admissionNumber: string }[] }

async function openSheet(page: Page, arm: string) {
  await gotoHydrated(page, '/scores')
  await page.getByTestId(`scores-sheet-${arm}-Mathematics`).click()
  await expect(page.getByTestId('sheet-title')).toHaveText(`Mathematics · ${arm}`)
}

const cell = (page: Page, row: number, col: number) => page.locator(`input[data-cell="${row}-${col}"]`)

test('the subject teacher types scores with the keyboard, fixes an invalid cell and saves; a locked class is read-only', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Writes JSS 1B and locks it; mobile has its own test')
  test.setTimeout(120_000)
  let sheetPath = ''
  let admissionNumber = ''

  try {
    await loginAs(page, GREENFIELD_USERS.teacher.email)
    await openSheet(page, 'JSS 1B')
    sheetPath = new URL(page.url()).pathname

    // First student without scores (the seed fills half the class)
    const rows = page.locator('[data-testid^="score-row-"]')
    let row = 0
    while (await cell(page, row, 0).inputValue() !== '') row++
    admissionNumber = (await rows.nth(row).getAttribute('data-testid'))!.replace('score-row-', '')

    await cell(page, row, 0).click()
    await page.keyboard.type('25')
    await page.keyboard.press('Tab')
    await page.keyboard.type('15')
    await page.keyboard.press('Tab')
    await page.keyboard.type('50')
    await expect(page.getByTestId(`cell-error-${row}-0`)).toHaveText('Enter a score from 0 to 20')
    await expect(page.getByTestId('scores-save')).toBeDisabled()

    await cell(page, row, 0).fill('18')
    await expect(page.getByTestId(`total-${row}`)).toHaveText('83')
    await expect(page.getByTestId(`grade-${row}`)).toHaveText('A')
    await page.getByTestId('scores-save').click()
    await expect(page.getByTestId('scores-save')).toHaveText('Save')

    await page.reload()
    await expect(page.locator(`[data-testid="score-row-${admissionNumber}"] input`).first()).toHaveValue('18')

    // The admin locks JSS 1B → the teacher sees the sheet read-only
    await page.context().clearCookies()
    await loginAs(page, GREENFIELD_USERS.admin.email)
    await gotoHydrated(page, '/scores')
    await choose(page, page.getByTestId('scores-arm-filter'), 'JSS 1B')
    await page.getByTestId('scores-lock-JSS 1B').click()
    await expect(page.getByTestId('scores-arm-JSS 1B')).toContainText('Locked')

    await page.context().clearCookies()
    await loginAs(page, GREENFIELD_USERS.teacher.email)
    await openSheet(page, 'JSS 1B')
    await expect(page.getByTestId('sheet-readonly')).toContainText('locked')
    await expect(cell(page, 0, 0)).toBeDisabled()
  }
  finally {
    // Unlock and clear the scores this test entered
    await page.context().clearCookies()
    await loginAs(page, GREENFIELD_USERS.admin.email)
    const [, , classArmId, subjectId] = sheetPath.split('/')
    if (classArmId && subjectId) {
      const sheet = await apiFromPage<Sheet>(page, 'GET', `/api/scores/sheet?classArmId=${classArmId}&subjectId=${subjectId}`)
      await apiFromPage(page, 'DELETE', '/api/scores/locks', { termId: sheet.term.id, classArmId })
      const student = sheet.students.find(s => s.admissionNumber === admissionNumber)
      if (student) {
        await apiFromPage(page, 'PUT', '/api/scores/sheet', {
          termId: sheet.term.id, classArmId, subjectId,
          entries: sheet.components.map(c => ({ studentId: student.id, componentId: c.id, value: null })),
        })
      }
    }
  }
})

test('on a phone the grid scrolls inside its card and a score can be saved', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile layout')
  await loginAs(page, GREENFIELD_USERS.teacher.email)
  await openSheet(page, 'JSS 1A')

  const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  expect(overflow).toBeLessThanOrEqual(0)

  const original = await cell(page, 0, 1).inputValue()
  const changed = original === '10' ? '11' : '10'
  try {
    await cell(page, 0, 1).fill(changed)
    await page.getByTestId('scores-save').click()
    await expect(page.getByTestId('scores-save')).toHaveText('Save')
    await page.reload()
    await expect(cell(page, 0, 1)).toHaveValue(changed)
  }
  finally {
    await cell(page, 0, 1).fill(original)
    if (await page.getByTestId('scores-save').isEnabled()) {
      await page.getByTestId('scores-save').click()
      await expect(page.getByTestId('scores-save')).toHaveText('Save')
    }
  }
})

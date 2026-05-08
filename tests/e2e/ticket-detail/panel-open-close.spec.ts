import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'

const KEY = 'HDR-700'
const URL_HAS_ISSUE = /[?&]issue=HDR-700(?:&|$)/

test('URL state advances correctly on every open/close transition', async ({ page, world }) => {
  world.seedIssues([makeIssue({ key: KEY, statusName: 'Reviewed' })])

  await page.goto('/?e2e=1')
  const card = page.locator(`[data-issue-key="${KEY}"]`)
  await expect(card).toBeVisible()
  expect(page.url()).not.toContain('issue=')

  // 1. Open via card click → URL grows the issue param.
  await card.click()
  await expect(page).toHaveURL(URL_HAS_ISSUE)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // 2. Close via Escape → URL drops the issue param.
  await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/[?&]issue=/)
  await expect(dialog).toHaveCount(0)

  // 3. Reopen via card click.
  await card.click()
  await expect(page).toHaveURL(URL_HAS_ISSUE)
  await expect(page.getByRole('dialog')).toBeVisible()

  // 4. Close via browser back.
  await page.goBack()
  await expect(page).not.toHaveURL(/[?&]issue=/)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // 5. Reopen via card click.
  await card.click()
  await expect(page).toHaveURL(URL_HAS_ISSUE)
  await expect(page.getByRole('dialog')).toBeVisible()

  // 6. Close via the panel's close button.
  await page.getByRole('button', { name: 'Close panel' }).click()
  await expect(page).not.toHaveURL(/[?&]issue=/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

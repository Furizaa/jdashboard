import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'

const KEYS = ['HDR-310', 'HDR-311', 'HDR-312'] as const
const STATUS = 'In Implementation'

// Seed three issues into the same board column, open the panel on the middle one,
// and verify each navigation entry-point (J/K, ArrowDown/ArrowUp, header arrows)
// updates `?issue=` in the URL.
test('panel navigation steps prev/next via keyboard and header arrows', async ({
  page,
  world,
}) => {
  world.seedIssues(KEYS.map((key) => makeIssue({ key, statusName: STATUS })))

  await page.goto('/?e2e=1')
  await expect(page.locator(`[data-issue-key="${KEYS[1]}"]`)).toBeVisible()

  // Open the middle issue's panel.
  await page.locator(`[data-issue-key="${KEYS[1]}"]`).click()
  await expect(page).toHaveURL(/[?&]issue=HDR-311/)
  await expect(page.getByRole('dialog')).toBeVisible()

  // J → next
  await page.keyboard.press('KeyJ')
  await expect(page).toHaveURL(/[?&]issue=HDR-312/)

  // K → prev
  await page.keyboard.press('KeyK')
  await expect(page).toHaveURL(/[?&]issue=HDR-311/)

  // ArrowDown → next
  await page.keyboard.press('ArrowDown')
  await expect(page).toHaveURL(/[?&]issue=HDR-312/)

  // ArrowUp → prev
  await page.keyboard.press('ArrowUp')
  await expect(page).toHaveURL(/[?&]issue=HDR-311/)

  // Header "Next ticket in column" arrow → next
  await page.getByRole('button', { name: 'Next ticket in column' }).click()
  await expect(page).toHaveURL(/[?&]issue=HDR-312/)

  // Header "Previous ticket in column" arrow → prev
  await page.getByRole('button', { name: 'Previous ticket in column' }).click()
  await expect(page).toHaveURL(/[?&]issue=HDR-311/)
})

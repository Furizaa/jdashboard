import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'
import { testIds } from '~/lib/testids'

test('cmd+k focuses search; typing filters; esc clears', async ({ page, world }) => {
  world.seedIssues([
    makeIssue({ key: 'HDR-501', summary: 'HDR-501: Apple cobbler', statusName: 'Reviewed' }),
    makeIssue({ key: 'HDR-502', summary: 'HDR-502: Banana split', statusName: 'In Implementation' }),
    makeIssue({ key: 'HDR-503', summary: 'HDR-503: Apple pie', statusName: 'In Code Review' }),
  ])

  await page.goto('/?e2e=1')

  const cards = page.getByTestId(testIds.ticketCard)
  await expect(cards).toHaveCount(3)

  const searchInput = page.getByPlaceholder('Search…')
  await expect(searchInput).not.toBeFocused()

  await page.keyboard.press('ControlOrMeta+KeyK')
  await expect(searchInput).toBeFocused()

  await page.keyboard.type('apple')

  await expect(page.locator('[data-issue-key="HDR-501"]')).toBeVisible()
  await expect(page.locator('[data-issue-key="HDR-503"]')).toBeVisible()
  await expect(page.locator('[data-issue-key="HDR-502"]')).toHaveCount(0)

  await page.keyboard.press('Escape')

  await expect(cards).toHaveCount(3)
  await expect(page.locator('[data-issue-key="HDR-502"]')).toBeVisible()
})

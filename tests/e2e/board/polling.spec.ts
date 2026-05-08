import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'

test('60s tick refetches and renders add/remove/change', async ({ page, world }) => {
  world.seedIssues([
    makeIssue({ key: 'HDR-301', statusName: 'Reviewed' }),
    makeIssue({ key: 'HDR-302', statusName: 'In Implementation' }),
  ])

  await page.goto('/?e2e=1')
  await expect(page.locator('[data-issue-key="HDR-301"]')).toBeVisible()
  await expect(page.locator('[data-issue-key="HDR-302"]')).toBeVisible()

  // Add HDR-303, remove HDR-301, change HDR-302's status.
  world.removeIssue('HDR-301')
  world.seedIssues([
    makeIssue({ key: 'HDR-302', statusName: 'In Code Review' }),
    makeIssue({ key: 'HDR-303', statusName: 'Reviewed' }),
  ])

  await page.clock.fastForward(60_000)

  await expect(page.locator('[data-issue-key="HDR-301"]')).toHaveCount(0)
  await expect(page.locator('[data-issue-key="HDR-303"]')).toBeVisible()

  const inCodeReviewColumn = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'In Code Review' }) })
  await expect(inCodeReviewColumn.locator('[data-issue-key="HDR-302"]')).toBeVisible()
})

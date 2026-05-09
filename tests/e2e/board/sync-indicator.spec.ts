import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'
import { testIds } from '~/lib/testids'

test('Synced label updates as time advances', async ({ page, world }) => {
  world.seedIssues([makeIssue({ key: 'HDR-601', statusName: 'Reviewed' })])

  await page.goto('/?e2e=1')
  await expect(page.locator('[data-issue-key="HDR-601"]')).toBeVisible()

  const indicator = page.getByTestId(testIds.syncIndicator)
  await expect(indicator).toContainText(/less than a minute/i)

  // Advance under the 60s poll interval so the indicator's tick re-renders
  // without a refetch resetting `dataUpdatedAt`.
  await page.clock.fastForward(30_000)

  await expect(indicator).toContainText(/1 minute/i)
})

test('manual refresh fan-out picks up world mutations without a poll', async ({ page, world }) => {
  world.seedIssues([makeIssue({ key: 'HDR-611', statusName: 'Reviewed' })])

  await page.goto('/?e2e=1')
  await expect(page.locator('[data-issue-key="HDR-611"]')).toBeVisible()
  await expect(page.locator('[data-issue-key="HDR-612"]')).toHaveCount(0)

  world.seedIssues([makeIssue({ key: 'HDR-612', statusName: 'In Implementation' })])

  await page.getByRole('button', { name: 'Refresh' }).click()

  await expect(page.locator('[data-issue-key="HDR-612"]')).toBeVisible()
})

test('repeated 5xx flips indicator to failed state with tooltip', async ({
  page,
  world,
  mocks,
}) => {
  world.seedIssues([makeIssue({ key: 'HDR-621', statusName: 'Reviewed' })])

  await page.goto('/?e2e=1')
  await expect(page.locator('[data-issue-key="HDR-621"]')).toBeVisible()

  // The Effect HttpClient retries transient (5xx) failures up to 2 times,
  // so a one-shot 500 is recovered. Queue enough 500s to exhaust the retry
  // budget on the refresh request (1 initial attempt + 2 retries).
  mocks.failNext('POST', '*/rest/api/3/search/jql', { status: 500, body: 'boom' })
  mocks.failNext('POST', '*/rest/api/3/search/jql', { status: 500, body: 'boom' })
  mocks.failNext('POST', '*/rest/api/3/search/jql', { status: 500, body: 'boom' })

  await page.getByRole('button', { name: 'Refresh' }).click()

  const failed = page.getByTestId(testIds.syncIndicator)
  await expect(failed).toHaveText('Sync failed · Retry')
  await expect(failed).toHaveAttribute('title', /.+/)
})

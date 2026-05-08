import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'

const BOARD_SEARCH_PATH = '/rest/api/3/search/jql'

test('polling pauses while hidden and resumes on visible', async ({ page, world, mocks }) => {
  world.seedIssues([makeIssue({ key: 'HDR-401', statusName: 'Reviewed' })])

  await page.goto('/?e2e=1')
  await expect(page.locator('[data-issue-key="HDR-401"]')).toBeVisible()

  const countBoardSearches = () =>
    mocks.requests().filter((r) => r.path === BOARD_SEARCH_PATH).length

  const beforeHidden = countBoardSearches()

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  await page.clock.fastForward(120_000)

  // No board refetches should occur while the tab is hidden.
  expect(countBoardSearches()).toBe(beforeHidden)

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  await expect.poll(countBoardSearches).toBeGreaterThan(beforeHidden)
})

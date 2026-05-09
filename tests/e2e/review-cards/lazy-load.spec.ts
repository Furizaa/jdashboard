import { http, HttpResponse } from 'msw'
import { test, expect } from '../fixtures/test'
import {
  makeApprovals,
  makeIssue,
  makeMr,
  makeMrReviewer,
  makePipeline,
} from '../fixtures/factories'

const ME = 'me-gitlab'
const OTHER = 'other-user'
const IID = 7700

const SEARCH_PATH = '/rest/api/3/search/jql'

test('the review-cards stream is gated on the Jira board, polls every 60s, pauses while hidden, and re-polls on visibility', async ({
  page,
  world,
  mocks,
}) => {
  world.seedGitlabCurrentUser({ username: ME, displayName: 'Me' })

  world.seedIssues([
    makeIssue({ key: 'HDR-700', summary: 'HDR-700: lazy-load board seed', statusName: 'Reviewed' }),
  ])

  // Authored by OTHER so author-mode listMrs has no candidates → mr-status
  // fan-out doesn't fire. The MR's title carries no Jira key, so the
  // review-card flow's bulk fetch is skipped client-side. That leaves
  // the MR's `/discussions` endpoint as a clean signal for review-card
  // fan-out activity.
  world.seedMrs([
    makeMr({ iid: IID, title: 'no key MR', authorUsername: OTHER, state: 'opened' }),
  ])
  world.seedMrReviewers(IID, [makeMrReviewer({ username: ME, state: 'unreviewed' })])
  world.seedMrApprovals(IID, makeApprovals())
  world.seedMrPipeline(IID, makePipeline())

  // Gate the board-search response so we can assert that the review-card
  // stream does not fire anything before the board has resolved. The bulk
  // fetch shares this endpoint — its JQL is `key in (…)` — so we let that
  // shape pass through immediately.
  let releaseBoard!: () => void
  const boardGate = new Promise<void>((resolve) => {
    releaseBoard = resolve
  })
  mocks.use(
    http.post(`*${SEARCH_PATH}`, async ({ request }) => {
      const body = (await request.json()) as { jql?: string }
      const jql = typeof body.jql === 'string' ? body.jql : ''
      if (!/key\s+in\s*\(/i.test(jql)) {
        await boardGate
      }
      return HttpResponse.json(world.searchIssues(jql))
    }),
  )

  await page.goto('/?e2e=1')

  const boardSearches = () =>
    mocks.requests().filter((r) => r.method === 'POST' && r.path === SEARCH_PATH).length
  const discussionsCalls = () =>
    mocks.requests().filter((r) => r.path.endsWith('/discussions')).length

  // Wait for the board search to be received (still pending behind the gate).
  await expect.poll(boardSearches).toBeGreaterThanOrEqual(1)

  // While the board is pending, the review-card stream must not have started
  // — discussions fan-out is gated on `jiraReady`.
  expect(discussionsCalls()).toBe(0)

  // Release the board response — the review-card stream now starts.
  releaseBoard()
  await expect.poll(discussionsCalls).toBeGreaterThanOrEqual(1)
  const afterFirstLoad = discussionsCalls()

  // 60s tick — the review-card stream re-polls.
  await page.clock.fastForward(60_000)
  await expect.poll(discussionsCalls).toBeGreaterThan(afterFirstLoad)
  const afterFirstPoll = discussionsCalls()

  // Hide the tab; advance 120s — polling pauses.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.clock.fastForward(120_000)
  expect(discussionsCalls()).toBe(afterFirstPoll)

  // Show the tab — re-polls immediately on the visibilitychange event.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(discussionsCalls).toBeGreaterThan(afterFirstPoll)
})

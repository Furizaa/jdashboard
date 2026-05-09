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

const AUTHOR_IID = 3010
const REVIEW_IID = 3020

const LIST_MRS_PATH_RE = /\/api\/v4\/projects\/[^/]+\/merge_requests$/
const DISCUSSIONS_PATH_RE = /\/api\/v4\/projects\/[^/]+\/merge_requests\/\d+\/discussions$/

test('two GitLab 401 events in one session surface a single dedupe-aware toast', async ({
  page,
  world,
  mocks,
}) => {
  // Seed both pipelines so author-mode and review-mode both have data to fan
  // out into. The dedupe set lives on the dashboard service singleton, so
  // `notifyUnauthorizedOnce('gitlab')` is shared across modes — whichever
  // pipeline lands the first 401 triggers the toast, and any subsequent 401
  // (from either mode) is suppressed.
  world.seedGitlabCurrentUser({ username: ME, displayName: 'Me' })
  world.seedIssues([
    makeIssue({ key: 'HDR-301', summary: 'HDR-301: seed', statusName: 'In Code Review' }),
  ])
  world.seedMrs([
    // Author-mode candidate: ME is the author, title carries the Jira key.
    makeMr({ iid: AUTHOR_IID, jiraKey: 'HDR-301', authorUsername: ME }),
    // Review-mode candidate: ME is a reviewer, title has no Jira key (fake card).
    makeMr({ iid: REVIEW_IID, title: 'review-only MR', authorUsername: OTHER }),
  ])
  world.seedMrReviewers(AUTHOR_IID, [makeMrReviewer({ username: 'rev-x', state: 'unreviewed' })])
  world.seedMrReviewers(REVIEW_IID, [makeMrReviewer({ username: ME, state: 'unreviewed' })])
  for (const iid of [AUTHOR_IID, REVIEW_IID]) {
    world.seedMrApprovals(iid, makeApprovals())
    world.seedMrPipeline(iid, makePipeline())
  }

  const toastRegion = page.getByRole('region', { name: /Notifications/ })
  const gitlabToast = toastRegion.getByText('GitLab auth failed — check `GITLAB_TOKEN`')

  // First 401 — fires on the next listMrs call. Both `useMrStatuses` and
  // `useReviewCards` hit this path on boot (with different query strings
  // for author/reviewer), so whichever races there first eats the one-shot
  // and ends up `{ ok: false, reason: 'unauthorized' }`. That triggers the
  // dedupe-aware toast exactly once.
  //
  // (We deliberately avoid `*/api/v4/user` for this assertion: the header's
  // `GitlabIndicator` also calls it on boot but doesn't notify the dashboard
  // service, so a one-shot there can be eaten without firing the toast.)
  mocks.failNext('GET', '*/api/v4/projects/*/merge_requests', { status: 401 })

  await page.goto('/?e2e=1')

  await expect(gitlabToast).toHaveCount(1)

  // Sonner's default duration is 4s. Fast-forward past it so any subsequent
  // toast would render against an empty region — making a duplicate, if any,
  // unambiguously visible.
  await page.clock.fastForward(10_000)
  await expect(gitlabToast).toHaveCount(0)

  // Second 401 on a *different* endpoint — a per-MR fan-out call this time.
  // The next 60s poll re-runs both pipelines; the first discussions request
  // (regardless of which mode emits it) consumes the one-shot and returns
  // unauthorized. The dedupe set already contains 'gitlab', so no new toast.
  const discussionsCallsBefore = mocks
    .requests()
    .filter((r) => DISCUSSIONS_PATH_RE.test(r.path)).length

  mocks.failNext('GET', '*/api/v4/projects/*/merge_requests/*/discussions', {
    status: 401,
  })

  await page.clock.fastForward(60_000)

  // Confirm the second 401 actually landed before asserting on the toast —
  // otherwise a green test could just mean "the request never fired".
  await expect
    .poll(() =>
      mocks.requests().filter((r) => DISCUSSIONS_PATH_RE.test(r.path)).length,
    )
    .toBeGreaterThan(discussionsCallsBefore)

  // Sanity check: the listMrs request also went out on the poll, proving the
  // refetch reached the listMrs stage where the first 401 originally landed.
  expect(
    mocks.requests().filter((r) => LIST_MRS_PATH_RE.test(r.path)).length,
  ).toBeGreaterThan(0)

  await expect(gitlabToast).toHaveCount(0)
})

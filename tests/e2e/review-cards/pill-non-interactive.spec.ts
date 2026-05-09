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

const IID_NEEDS = 6001
const IID_REJECTED = 6002
const IID_ACCEPTED = 6003

test('the status pill on a review card renders the bucket name and is non-interactive — clicking it opens no dropdown and fires no transitions fetch', async ({
  page,
  world,
  mocks,
}) => {
  world.seedGitlabCurrentUser({ username: ME, displayName: 'Me' })

  // Board hides everything when there are zero Jira issues — seed one so
  // the columns render and the review cards appear with them.
  world.seedIssues([makeIssue({ key: 'HDR-600', statusName: 'In Implementation' })])

  world.seedMrs([
    makeMr({ iid: IID_NEEDS, title: 'no key (needs)', authorUsername: OTHER, state: 'opened' }),
    makeMr({
      iid: IID_REJECTED,
      title: 'no key (rejected)',
      authorUsername: OTHER,
      state: 'opened',
    }),
    makeMr({
      iid: IID_ACCEPTED,
      title: 'no key (accepted)',
      authorUsername: OTHER,
      state: 'merged',
    }),
  ])
  world.seedMrReviewers(IID_NEEDS, [makeMrReviewer({ username: ME, state: 'unreviewed' })])
  world.seedMrReviewers(IID_REJECTED, [
    makeMrReviewer({ username: ME, state: 'requested_changes' }),
  ])
  world.seedMrReviewers(IID_ACCEPTED, [makeMrReviewer({ username: ME, state: 'reviewed' })])
  for (const iid of [IID_NEEDS, IID_REJECTED, IID_ACCEPTED]) {
    world.seedMrApprovals(iid, makeApprovals())
    world.seedMrPipeline(iid, makePipeline())
  }

  await page.goto('/?e2e=1')

  const cards: ReadonlyArray<readonly [number, string]> = [
    [IID_NEEDS, 'Needs Review'],
    [IID_REJECTED, 'Review Rejected'],
    [IID_ACCEPTED, 'Review Accepted'],
  ]

  // The pill text matches the bucket name on each card; the structural marker
  // for a non-interactive pill is the absence of the `Change status from …`
  // button that StatusPillSelect renders.
  await Promise.all(
    cards.flatMap(([iid, pillText]) => {
      const card = page.locator(`[data-issue-key="MR !${iid}"]`)
      return [
        expect(card).toBeVisible(),
        expect(card).toContainText(pillText),
        expect(
          card.getByRole('button', { name: /Change status from/ }),
          `MR !${iid}: pill must not render as a clickable button`,
        ).toHaveCount(0),
      ]
    }),
  )

  const transitionGets = () =>
    mocks.requests().filter((r) => r.method === 'GET' && r.path.endsWith('/transitions')).length
  const beforeClicks = transitionGets()

  // Clicking the pill text on a review card must NOT trigger anything — the
  // wrapper span stops propagation, so the body's panel-open handler doesn't
  // fire either.
  await Promise.all(
    cards.map(([iid, pillText]) =>
      page
        .locator(`[data-issue-key="MR !${iid}"]`)
        .getByText(pillText, { exact: true })
        .click(),
    ),
  )

  // Give any potentially-deferred fetch room to fire before asserting it
  // hasn't. 200ms is well past the React commit + React Query queueMicrotask.
  await page.waitForTimeout(200)

  await expect(page.getByRole('menu')).toHaveCount(0)
  expect(transitionGets()).toBe(beforeClicks)
  // The pill's wrapper stops propagation, so the body click → panel-open
  // handler must not have fired either.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(page.url()).not.toContain('issue=')
})

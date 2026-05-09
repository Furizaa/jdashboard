import { test, expect } from '../fixtures/test'
import {
  makeApprovals,
  makeIssue,
  makeMr,
  makeMrReviewer,
  makePipeline,
} from '../fixtures/factories'
import { cardKind, testIds } from '~/lib/testids'

const ME = 'me-gitlab'
const OTHER = 'other-user'

const IID_DELETED_KEY = 5001
const IID_NO_KEY = 5002
// Point the click-target hosts at the MSW sidecar so the new tabs land on a
// host that responds (the sidecar returns 501 for unmatched paths). With
// `gitlab.example` Chromium would resolve to chrome-error and `url()` would
// be useless for the assertion. We only care about the navigation target.
const URL_DELETED_KEY = `http://127.0.0.1:9999/proj/-/merge_requests/${IID_DELETED_KEY}`
const URL_NO_KEY = `http://127.0.0.1:9999/proj/-/merge_requests/${IID_NO_KEY}`

test('MR with a Jira key absent from the bulk fetch and an MR with no Jira key both render as fake review cards; body and key clicks open the MR in a new tab', async ({
  page,
  world,
  context,
}) => {
  world.seedGitlabCurrentUser({ username: ME, displayName: 'Me' })

  // Board renders the empty-board message when no Jira issues are seeded,
  // which would hide the review-card column. Seed a placeholder so the
  // columns render and review cards appear.
  world.seedIssues([makeIssue({ key: 'HDR-500', statusName: 'In Implementation' })])

  // First MR's title contains HDR-99999, but no such issue is seeded — the
  // bulk fetch returns it as missing, so the card falls back to fake.
  // Second MR's title contains no Jira key at all → also fake.
  world.seedMrs([
    makeMr({
      iid: IID_DELETED_KEY,
      title: 'HDR-99999: deleted issue',
      webUrl: URL_DELETED_KEY,
      authorUsername: OTHER,
      state: 'opened',
    }),
    makeMr({
      iid: IID_NO_KEY,
      title: 'chore: bump deps',
      webUrl: URL_NO_KEY,
      authorUsername: OTHER,
      state: 'opened',
    }),
  ])
  for (const iid of [IID_DELETED_KEY, IID_NO_KEY]) {
    world.seedMrReviewers(iid, [makeMrReviewer({ username: ME, state: 'unreviewed' })])
    world.seedMrApprovals(iid, makeApprovals())
    world.seedMrPipeline(iid, makePipeline())
  }

  await page.goto('/?e2e=1')

  const cardDeleted = page.locator(`[data-issue-key="MR !${IID_DELETED_KEY}"]`)
  const cardNoKey = page.locator(`[data-issue-key="MR !${IID_NO_KEY}"]`)
  await expect(cardDeleted).toBeVisible()
  await expect(cardNoKey).toBeVisible()

  // Both render as fake review cards — GitMerge icon, no labels, no epic.
  await Promise.all(
    [cardDeleted, cardNoKey].flatMap((card) => [
      expect(card).toHaveAttribute('data-card-kind', cardKind.reviewFake),
      expect(card.getByLabel('Merge request')).toBeVisible(),
      expect(card.getByTestId(testIds.labelDot)).toHaveCount(0),
      expect(card.getByTestId(testIds.labelOverflowChip)).toHaveCount(0),
      expect(card.getByTestId(testIds.epicChip)).toHaveCount(0),
    ]),
  )

  // The MR title is the summary text on each card.
  await expect(cardDeleted).toContainText('HDR-99999: deleted issue')
  await expect(cardNoKey).toContainText('chore: bump deps')

  // Click the body of the no-key card → opens the MR URL in a new tab and
  // does NOT open the Jira detail panel (no `?issue=` on the original tab).
  const [bodyTab] = await Promise.all([
    context.waitForEvent('page'),
    cardNoKey.click(),
  ])
  await expect.poll(() => bodyTab.url(), { timeout: 5_000 }).toBe(URL_NO_KEY)
  await bodyTab.close()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(page.url()).not.toContain('issue=')

  // Click the key of the deleted-key card → opens the MR URL in a new tab.
  const keyButton = cardDeleted.getByRole('button', {
    name: `Open MR for MR !${IID_DELETED_KEY}`,
  })
  const [keyTab] = await Promise.all([
    context.waitForEvent('page'),
    keyButton.click(),
  ])
  await expect.poll(() => keyTab.url(), { timeout: 5_000 }).toBe(URL_DELETED_KEY)
  await keyTab.close()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

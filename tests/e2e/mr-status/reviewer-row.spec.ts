import { test, expect } from '../fixtures/test'
import {
  makeApprovals,
  makeDiscussion,
  makeIssue,
  makeMr,
  makeMrReviewer,
  makePipeline,
} from '../fixtures/factories'
import { testIds } from '~/lib/testids'

const ISSUE_KEY = 'HDR-700'
const MR_IID = 7000

test('reviewer row renders one avatar per assigned reviewer (with and without avatar URL)', async ({
  page,
  world,
}) => {
  // Author of the MR is the GitLab current user — that's how author-mode
  // listMrs picks the MR up.
  world.seedGitlabCurrentUser({ username: 'me-gitlab', displayName: 'Me' })

  world.seedIssues([
    makeIssue({ key: ISSUE_KEY, summary: `${ISSUE_KEY}: Reviewer row`, statusName: 'In Code Review' }),
  ])

  const reviewerWithAvatar = makeMrReviewer({
    username: 'alice',
    displayName: 'Alice Reviewer',
    avatarUrl: 'http://127.0.0.1:9999/alice.png',
    state: 'unreviewed',
  })
  const reviewerWithoutAvatar = makeMrReviewer({
    username: 'bob',
    displayName: 'Bob Reviewer',
    avatarUrl: null,
    state: 'reviewed',
  })

  world.seedMrs([
    makeMr({
      iid: MR_IID,
      jiraKey: ISSUE_KEY,
      authorUsername: 'me-gitlab',
      state: 'opened',
      draft: false,
    }),
  ])
  world.seedMrReviewers(MR_IID, [reviewerWithAvatar, reviewerWithoutAvatar])
  world.seedMrDiscussions(MR_IID, [
    // Note authored by Bob so that author-mode `summarizeMr` derives Bob's
    // approval status as 'reviewed' (commented but not approved). Alice has
    // no notes, so she stays 'unreviewed'.
    makeDiscussion({ id: 'd-1', notes: [{ authorUsername: 'bob' }] }),
  ])
  world.seedMrApprovals(MR_IID, makeApprovals())
  world.seedMrPipeline(MR_IID, makePipeline({ status: 'success' }))

  await page.goto('/?e2e=1')

  const card = page.locator(`[data-issue-key="${ISSUE_KEY}"]`)
  const mrSection = card.getByTestId(testIds.mrSection)
  await expect(mrSection).toBeVisible()

  const avatars = mrSection.getByTestId(testIds.reviewerAvatar)
  await expect(avatars).toHaveCount(2)

  // The component encodes per-reviewer state via `data-visual-state` on the
  // avatar (mirrors `ReviewerVisualState` from `reviewer-state.ts`):
  // - unreviewed (no notes, no approval) → 'gray-dashed'
  // - reviewed (endpoint state 'reviewed' → 'reviewed' approval status) → 'blue-dashed'
  const aliceAvatar = avatars.filter({
    has: page.locator('img[src="http://127.0.0.1:9999/alice.png"]'),
  })
  await expect(aliceAvatar).toHaveAttribute('data-visual-state', 'gray-dashed')

  // Bob has no avatar URL, so the component falls back to the first letter
  // of the display name. Use that to pick him out of the row.
  const bobAvatar = avatars.filter({ hasText: 'B' })
  await expect(bobAvatar).toHaveAttribute('data-visual-state', 'blue-dashed')

  // Both avatars carry the human-readable title used by the panel tooltip.
  await expect(aliceAvatar).toHaveAttribute('title', /Alice Reviewer — Not started/)
  await expect(bobAvatar).toHaveAttribute('title', /Bob Reviewer — Commented/)
})

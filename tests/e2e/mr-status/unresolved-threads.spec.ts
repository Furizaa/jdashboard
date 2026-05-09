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

const ISSUE_KEY = 'HDR-740'
const MR_IID = 7400
const ME = 'me-gitlab'

test('unresolved-thread chip count follows the count rule', async ({ page, world }) => {
  world.seedGitlabCurrentUser({ username: ME, displayName: 'Me' })

  world.seedIssues([
    makeIssue({
      key: ISSUE_KEY,
      summary: `${ISSUE_KEY}: Unresolved threads`,
      statusName: 'In Code Review',
    }),
  ])

  world.seedMrs([
    makeMr({
      iid: MR_IID,
      jiraKey: ISSUE_KEY,
      authorUsername: ME,
      state: 'opened',
      draft: false,
    }),
  ])
  world.seedMrReviewers(MR_IID, [makeMrReviewer({ username: 'alice' })])
  world.seedMrApprovals(MR_IID, makeApprovals())
  world.seedMrPipeline(MR_IID, makePipeline({ status: 'success' }))

  // Discussions exercising every limb of the rule
  // (`countUnresolvedThreads` in `~/kernel/mr/count-unresolved.ts`):
  //   - resolvable + !resolved + non-system → counted
  //   - !resolvable + non-system → counted (general MR comments)
  //   - resolvable + resolved → excluded
  //   - system note (first note) → excluded
  // The current implementation does *not* exclude threads whose first note
  // is authored by the current user — `count-unresolved.test.ts` documents
  // this as the expected behaviour. Mirror that here.
  world.seedMrDiscussions(MR_IID, [
    // counted (1) — vanilla unresolved review thread.
    makeDiscussion({
      id: 'd-counted-resolvable',
      notes: [{ authorUsername: 'alice', resolvable: true, resolved: false }],
    }),
    // counted (2) — non-resolvable general comment.
    makeDiscussion({
      id: 'd-counted-general',
      notes: [{ authorUsername: 'alice', resolvable: false, resolved: false }],
    }),
    // excluded — resolved.
    makeDiscussion({
      id: 'd-excluded-resolved',
      notes: [{ authorUsername: 'alice', resolvable: true, resolved: true }],
    }),
    // excluded — system note.
    makeDiscussion({
      id: 'd-excluded-system',
      notes: [{ authorUsername: 'alice', resolvable: false, resolved: false, system: true }],
    }),
    // counted (3) — first-note author is the current user. The author-mode
    // counter does not exclude self-authored threads, so this still counts.
    makeDiscussion({
      id: 'd-self',
      notes: [{ authorUsername: ME, resolvable: true, resolved: false }],
    }),
  ])

  await page.goto('/?e2e=1')

  const card = page.locator(`[data-issue-key="${ISSUE_KEY}"]`)
  const chip = card.getByTestId(testIds.unresolvedThreadChip)
  await expect(chip).toBeVisible()
  await expect(chip).toHaveText('3')
  await expect(chip).toHaveAttribute('title', '3 unresolved comment threads')
})

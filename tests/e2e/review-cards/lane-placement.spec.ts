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

const JIRA_REVIEWED = 'HDR-810'
const JIRA_BLOCKED = 'HDR-820'
const JIRA_DONE = 'HDR-830'

const IID_NEEDS = 9001
const IID_REJECTED = 9002
const IID_ACCEPTED = 9003

test('review cards land in the bucket-mapped lane and slot into the full sort tier order', async ({
  page,
  world,
}) => {
  world.seedGitlabCurrentUser({ username: ME, displayName: 'Me' })

  // Three Jira cards covering every other tier the test cares about:
  // - Reviewed → TO DO (Ready to Pick rename)
  // - Blocked  → TO DO (last tier)
  // - Done     → Done
  world.seedIssues([
    makeIssue({
      key: JIRA_REVIEWED,
      summary: `${JIRA_REVIEWED}: ready to pick`,
      statusName: 'Reviewed',
    }),
    makeIssue({
      key: JIRA_BLOCKED,
      summary: `${JIRA_BLOCKED}: blocked`,
      statusName: 'Blocked',
    }),
    makeIssue({ key: JIRA_DONE, summary: `${JIRA_DONE}: done`, statusName: 'Done' }),
  ])

  // Each MR is authored by OTHER so author-mode listMrs has no candidates,
  // while reviewer-mode includes ME and yields each MR. None of the titles
  // contain a Jira key, so all three render as fake review cards — distinct
  // `data-issue-key` values that don't collide with any Jira card key.
  world.seedMrs([
    makeMr({
      iid: IID_NEEDS,
      title: 'no key MR (needs review)',
      authorUsername: OTHER,
      state: 'opened',
    }),
    makeMr({
      iid: IID_REJECTED,
      title: 'no key MR (rejected)',
      authorUsername: OTHER,
      state: 'opened',
    }),
    makeMr({
      iid: IID_ACCEPTED,
      title: 'no key MR (accepted)',
      authorUsername: OTHER,
      state: 'merged',
    }),
  ])

  // Bucket assignment: open + my-state=unreviewed → needs-review;
  // open + my-state=requested_changes → rejected; merged → accepted.
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

  const todoColumn = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'TO DO' }) })
  const doneColumn = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Done' }) })

  // Wait for the full set to render (review cards arrive after the board).
  const todoCards = todoColumn.locator('[data-testid="ticket-card"]')
  const doneCards = doneColumn.locator('[data-testid="ticket-card"]')
  await expect(todoCards).toHaveCount(4)
  await expect(doneCards).toHaveCount(2)

  // TO DO sort tier order:
  //   Needs Review → Reviewed (Ready to Pick) → Review Rejected → Blocked.
  await expect(todoCards.nth(0)).toHaveAttribute('data-issue-key', `MR !${IID_NEEDS}`)
  await expect(todoCards.nth(1)).toHaveAttribute('data-issue-key', JIRA_REVIEWED)
  await expect(todoCards.nth(2)).toHaveAttribute('data-issue-key', `MR !${IID_REJECTED}`)
  await expect(todoCards.nth(3)).toHaveAttribute('data-issue-key', JIRA_BLOCKED)

  // Done sort tier order: … Done → Review Accepted (review-accepted is last).
  await expect(doneCards.nth(0)).toHaveAttribute('data-issue-key', JIRA_DONE)
  await expect(doneCards.nth(1)).toHaveAttribute('data-issue-key', `MR !${IID_ACCEPTED}`)

  // The `READY TO PICK` rename is applied to the Jira `Reviewed` card's pill.
  await expect(todoCards.nth(1)).toContainText('Ready to Pick')
})

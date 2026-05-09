import { test, expect } from '../fixtures/test'
import {
  makeApprovals,
  makeIssue,
  makeMr,
  makeMrReviewer,
  makePipeline,
} from '../fixtures/factories'
import { mrWarningKind, testIds } from '~/lib/testids'

const ME = 'me-gitlab'

const ISSUE_NO_MR = 'HDR-781'
const ISSUE_DRAFT = 'HDR-782'
const ISSUE_NO_REVIEWERS = 'HDR-783'
const ISSUE_MERGED_DESYNC = 'HDR-784'

const IID_DRAFT = 7820
const IID_NO_REVIEWERS = 7830
const IID_MERGED_DESYNC = 7840

test('author-mode warning rows render the correct kind for each scenario', async ({
  page,
  world,
}) => {
  world.seedGitlabCurrentUser({ username: ME, displayName: 'Me' })

  world.seedIssues([
    // 1. In Code Review with no MR — "no-mr" warning.
    makeIssue({ key: ISSUE_NO_MR, summary: `${ISSUE_NO_MR}: no MR`, statusName: 'In Code Review' }),
    // 2. In Code Review, MR is a draft.
    makeIssue({ key: ISSUE_DRAFT, summary: `${ISSUE_DRAFT}: draft MR`, statusName: 'In Code Review' }),
    // 3. In Code Review, MR has zero reviewers.
    makeIssue({
      key: ISSUE_NO_REVIEWERS,
      summary: `${ISSUE_NO_REVIEWERS}: no reviewers`,
      statusName: 'In Code Review',
    }),
    // 4. In Code Review, but the MR has already been merged (board out of sync).
    makeIssue({
      key: ISSUE_MERGED_DESYNC,
      summary: `${ISSUE_MERGED_DESYNC}: merged-desync`,
      statusName: 'In Code Review',
    }),
  ])

  // Draft MR — `summarizeMr` emits `kind: 'draft'` regardless of reviewers.
  world.seedMrs([
    makeMr({
      iid: IID_DRAFT,
      jiraKey: ISSUE_DRAFT,
      authorUsername: ME,
      state: 'opened',
      draft: true,
    }),
    makeMr({
      iid: IID_NO_REVIEWERS,
      jiraKey: ISSUE_NO_REVIEWERS,
      authorUsername: ME,
      state: 'opened',
      draft: false,
    }),
    makeMr({
      iid: IID_MERGED_DESYNC,
      jiraKey: ISSUE_MERGED_DESYNC,
      authorUsername: ME,
      state: 'merged',
      draft: false,
    }),
  ])
  // Draft + merged-desync still need at least one reviewer recorded so the
  // detail-fan-out completes; the kind discriminator wins before reviewers
  // are inspected. The no-reviewers case explicitly seeds an empty list.
  world.seedMrReviewers(IID_DRAFT, [makeMrReviewer({ username: 'alice' })])
  world.seedMrReviewers(IID_NO_REVIEWERS, [])
  world.seedMrReviewers(IID_MERGED_DESYNC, [makeMrReviewer({ username: 'alice' })])

  for (const iid of [IID_DRAFT, IID_NO_REVIEWERS, IID_MERGED_DESYNC]) {
    world.seedMrApprovals(iid, makeApprovals())
    world.seedMrPipeline(iid, makePipeline())
  }

  await page.goto('/?e2e=1')

  await assertWarning(page, ISSUE_NO_MR, mrWarningKind.noMr, /No MR found/)
  await assertWarning(page, ISSUE_DRAFT, mrWarningKind.draft, /MR is draft/)
  await assertWarning(page, ISSUE_NO_REVIEWERS, mrWarningKind.noReviewers, /no reviewers assigned/)
  await assertWarning(
    page,
    ISSUE_MERGED_DESYNC,
    mrWarningKind.mergedDesync,
    /MR is merged.*move ticket to In STG/,
  )
})

async function assertWarning(
  page: import('@playwright/test').Page,
  issueKey: string,
  expectedKind: string,
  expectedText: RegExp,
) {
  const card = page.locator(`[data-issue-key="${issueKey}"]`)
  const warning = card.getByTestId(testIds.mrWarningRow)
  // Polled because mr-status fetches asynchronously after the board renders.
  await expect(warning, `${issueKey}: warning row visible`).toBeVisible()
  await expect(warning, `${issueKey}: warning kind discriminator`).toHaveAttribute(
    'data-kind',
    expectedKind,
  )
  await expect(warning, `${issueKey}: warning text`).toContainText(expectedText)
}

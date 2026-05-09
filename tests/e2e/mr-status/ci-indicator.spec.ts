import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/test'
import {
  makeApprovals,
  makeIssue,
  makeMr,
  makeMrReviewer,
  makePipeline,
} from '../fixtures/factories'
import { testIds } from '~/lib/testids'

/**
 * MR-CI indicator covers all four pipeline states plus the conflict bit.
 * Precedence rule: conflict > failed > running > success > none. Each case
 * is one card on the board so the matrix runs in a single page load.
 */
type Case = {
  issueKey: string
  iid: number
  pipelineStatus: string | null
  hasConflicts: boolean
  expectedDataState: 'conflict' | 'failed' | 'running' | 'passed' | null
  expectedTitle: string | null
}

const CASES: readonly Case[] = [
  {
    issueKey: 'HDR-721',
    iid: 7210,
    pipelineStatus: 'success',
    hasConflicts: false,
    expectedDataState: 'passed',
    expectedTitle: 'CI passed',
  },
  {
    issueKey: 'HDR-722',
    iid: 7220,
    pipelineStatus: 'failed',
    hasConflicts: false,
    expectedDataState: 'failed',
    expectedTitle: 'CI failed',
  },
  {
    issueKey: 'HDR-723',
    iid: 7230,
    pipelineStatus: 'running',
    hasConflicts: false,
    expectedDataState: 'running',
    expectedTitle: 'CI running',
  },
  {
    issueKey: 'HDR-724',
    iid: 7240,
    pipelineStatus: null,
    hasConflicts: false,
    expectedDataState: null,
    expectedTitle: null,
  },
  // Conflict precedence: even with `success` pipeline, the conflict bit wins.
  {
    issueKey: 'HDR-725',
    iid: 7250,
    pipelineStatus: 'success',
    hasConflicts: true,
    expectedDataState: 'conflict',
    expectedTitle: 'Merge conflict',
  },
]

test('CI indicator covers all four pipeline states plus conflict precedence', async ({
  page,
  world,
}) => {
  world.seedGitlabCurrentUser({ username: 'me-gitlab', displayName: 'Me' })

  // Seed each case as its own card. Reviewers are required so the MR ends
  // in the `kind: 'review'` branch (the only branch that renders the row +
  // CI indicator). Approvals/discussions stay empty.
  world.seedIssues(
    CASES.map((c) =>
      makeIssue({
        key: c.issueKey,
        summary: `${c.issueKey}: CI case`,
        statusName: 'In Code Review',
      }),
    ),
  )
  world.seedMrs(
    CASES.map((c) =>
      makeMr({
        iid: c.iid,
        jiraKey: c.issueKey,
        authorUsername: 'me-gitlab',
        state: 'opened',
      }),
    ),
  )
  for (const c of CASES) {
    world.seedMrReviewers(c.iid, [makeMrReviewer({ username: 'rev-1' })])
    world.seedMrApprovals(c.iid, makeApprovals())
    world.seedMrPipeline(
      c.iid,
      makePipeline({ status: c.pipelineStatus, hasConflicts: c.hasConflicts }),
    )
  }

  await page.goto('/?e2e=1')

  // Sequential rather than `Promise.all` because each `assertCi` hovers the
  // indicator to materialise the native title — concurrent hovers would
  // race the cursor between cards.
  await assertCi(page, CASES[0]!)
  await assertCi(page, CASES[1]!)
  await assertCi(page, CASES[2]!)
  await assertCi(page, CASES[3]!)
  await assertCi(page, CASES[4]!)
})

async function assertCi(page: Page, c: Case) {
  const card = page.locator(`[data-issue-key="${c.issueKey}"]`)
  const mrSection = card.getByTestId(testIds.mrSection)
  await expect(mrSection, `${c.issueKey} mr-section visible`).toBeVisible()

  const indicator = mrSection.getByTestId(testIds.ciIndicator)
  if (c.expectedDataState === null) {
    await expect(indicator, `${c.issueKey} no indicator when state=none`).toHaveCount(0)
    return
  }
  await expect(indicator, `${c.issueKey} indicator state`).toHaveAttribute(
    'data-state',
    c.expectedDataState,
  )

  // Hover and assert the native `title` tooltip text (the only on-screen
  // signal of which CI state is rendered, per `MrCiIndicator.tsx`).
  await indicator.hover()
  await expect(indicator, `${c.issueKey} indicator title`).toHaveAttribute(
    'title',
    c.expectedTitle as string,
  )
}

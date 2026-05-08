import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'

const STATUS_TO_COLUMN: Record<string, string> = {
  Reviewed: 'TO DO',
  Blocked: 'TO DO',
  'In Implementation': 'In Implementation',
  'In Code Review': 'In Code Review',
  'In STG': 'Done',
  'In QA': 'Done',
  'In UAT': 'Done',
  Done: 'Done',
}

test('each Jira status lands in its mapped column', async ({ page, world }) => {
  const seeds = Object.entries(STATUS_TO_COLUMN).map(([status], idx) =>
    makeIssue({ key: `HDR-${500 + idx}`, statusName: status }),
  )
  world.seedIssues(seeds)

  await page.goto('/?e2e=1')

  await Promise.all(
    Object.entries(STATUS_TO_COLUMN).map(([status, expectedColumn]) => {
      const issueKey = seeds.find((i) => i.fields.status.name === status)!.key
      const column = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { level: 2, name: expectedColumn }) })
      return expect(
        column.locator(`[data-issue-key="${issueKey}"]`),
        `${issueKey} (${status}) should be in ${expectedColumn}`,
      ).toBeVisible()
    }),
  )
})

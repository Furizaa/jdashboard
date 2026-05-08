import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'
import { testIds } from '~/lib/testids'

const PARENT = 'HDR-400'
const LINKED = 'OUTSIDE-1'

test('renders sub-issues progress + linked-issues, and fetches a linked-issue key not on the board', async ({
  page,
  world,
  mocks,
}) => {
  // Parent issue is on the board.
  world.seedIssues([makeIssue({ key: PARENT, statusName: 'In Implementation' })])

  // Three sub-issues: 2 done, 1 in progress → "2/3 done" chip.
  // `seedIssueDetail({ subtasks })` also seeds them as RawIssues with parent=PARENT
  // so the panel's `parent = "..."` cross-JQL fetch returns them.
  world.seedIssueDetail(PARENT, {
    subtasks: [
      { key: 'HDR-401', summary: 'sub one', statusCategory: 'done', statusName: 'Done' },
      { key: 'HDR-402', summary: 'sub two', statusCategory: 'done', statusName: 'Done' },
      {
        key: 'HDR-403',
        summary: 'sub three',
        statusCategory: 'indeterminate',
        statusName: 'In Implementation',
      },
    ],
    issuelinks: [
      {
        id: 'lnk-1',
        type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
        outwardIssue: {
          key: LINKED,
          fields: {
            summary: 'Cross-project ticket',
            status: {
              name: 'In Implementation',
              statusCategory: { key: 'indeterminate', name: 'In Progress' },
            },
            issuetype: { name: 'Task' },
          },
        },
      },
    ],
  })

  // Linked issue lives in a different label/project space — stand-alone seed
  // so the World can serve `GET /rest/api/3/issue/OUTSIDE-1` after a row click.
  world.seedIssues([
    makeIssue({
      key: LINKED,
      summary: 'Cross-project ticket',
      statusName: 'In Implementation',
      labels: ['other-team'],
    }),
  ])

  await page.goto('/?e2e=1')
  await page.locator(`[data-issue-key="${PARENT}"]`).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/[?&]issue=HDR-400/)

  const subRows = page.getByTestId(testIds.subIssueRow)
  await expect(subRows).toHaveCount(3)
  await expect(dialog.getByText('2/3 done')).toBeVisible()

  const linkedRows = page.getByTestId(testIds.linkedIssueRow)
  await expect(linkedRows).toHaveCount(1)
  await expect(linkedRows.first()).toContainText(LINKED)

  // Click the linked-issue row → panel must navigate to that key (URL + body).
  await linkedRows.first().click()
  await expect(page).toHaveURL(/[?&]issue=OUTSIDE-1/)
  await expect(dialog).toContainText('Cross-project ticket')

  // Cross-JQL evidence: a fetch for OUTSIDE-1 — a key never returned by the
  // board's labels-filtered JQL — must appear in the MSW request log. This is
  // the path that proves the panel can resolve issues outside the board.
  await expect
    .poll(() =>
      mocks
        .requests()
        .some((r) => r.method === 'GET' && r.path === `/rest/api/3/issue/${LINKED}`),
    )
    .toBe(true)
})

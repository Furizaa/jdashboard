import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'
import { testIds } from '~/lib/testids'

// `playwright.config.ts` mirrors `JIRA_LABEL_FILTER` into the runner process
// before the test runner starts, so this is the configured value, not a
// hardcoded literal local to the spec.
const FILTER_LABEL = process.env.JIRA_LABEL_FILTER

if (FILTER_LABEL === undefined || FILTER_LABEL === '') {
  throw new Error('JIRA_LABEL_FILTER must be set for ticket-card label-dots specs')
}

test('first three remaining labels render as dots, +N chip covers the rest, filter label is hidden', async ({
  page,
  world,
}) => {
  const labels = [FILTER_LABEL, 'Alpha', 'Bravo', 'Charlie', 'Delta']
  world.seedIssues([makeIssue({ key: 'HDR-901', statusName: 'Reviewed', labels })])

  await page.goto('/?e2e=1')
  const card = page.locator('[data-issue-key="HDR-901"]')
  await expect(card).toBeVisible()

  // Filter label is hidden everywhere on the card (no dot, no chip).
  await expect(card.getByText(FILTER_LABEL, { exact: true })).toHaveCount(0)

  // Of the four remaining labels, the first three render as dots.
  const dots = card.getByTestId(testIds.labelDot)
  await expect(dots).toHaveCount(3)

  // The +N chip covers the remaining (5 − 1 hidden − 3 visible = 1) label.
  await expect(card.getByTestId(testIds.labelOverflowChip)).toHaveText('+1')

  // None of the visible dots correspond to the filter label.
  const dotTitles = await dots.evaluateAll((els) =>
    els.map((el) => el.getAttribute('title')),
  )
  expect(dotTitles).not.toContain(FILTER_LABEL)
})

test('hovering a label dot exposes its label string via the native title attribute', async ({
  page,
  world,
}) => {
  world.seedIssues([
    makeIssue({ key: 'HDR-902', statusName: 'Reviewed', labels: [FILTER_LABEL, 'Alpha'] }),
  ])
  await page.goto('/?e2e=1')

  const card = page.locator('[data-issue-key="HDR-902"]')
  const dot = card.getByTestId(testIds.labelDot).first()
  await dot.hover()

  await expect(dot).toHaveAttribute('title', 'Alpha')
})

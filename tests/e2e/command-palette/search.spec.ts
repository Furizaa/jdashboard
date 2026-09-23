import { test, expect } from '../fixtures/test'
import {
  makeApprovals,
  makeIssue,
  makeMr,
  makeMrReviewer,
  makePipeline,
} from '../fixtures/factories'
import { testIds } from '~/lib/testids'
import { itemRows, openPalette, paletteRows } from './open-palette'

const ME = 'me-gitlab'

test('search spans assigned tickets and review cards, and ranks an exact key hit first', async ({
  page,
  world,
}) => {
  world.seedGitlabCurrentUser({ username: ME, displayName: 'Me' })
  world.seedIssues([
    // Mentions HDR-701 in its summary but is not it — must rank below.
    makeIssue({ key: 'HDR-700', summary: 'Follow-up to HDR-701', statusName: 'Reviewed' }),
    makeIssue({ key: 'HDR-701', summary: 'Trajectory minimap', statusName: 'Reviewed' }),
  ])
  // An MR waiting on our review whose title carries no Jira key renders as a
  // fake review card — the third source the palette has to reach.
  world.seedMrs([
    makeMr({ iid: 7100, title: 'Bump deps', jiraKey: 'NONE-0', authorUsername: 'someone' }),
  ])
  world.seedMrReviewers(7100, [makeMrReviewer({ username: ME, state: 'unreviewed' })])
  world.seedMrApprovals(7100, makeApprovals())
  world.seedMrPipeline(7100, makePipeline())

  await page.goto('/?e2e=1')
  // The review-card fan-out is several round trips behind the Jira board, so
  // wait for the card itself rather than a bare count.
  await expect(page.locator('[data-issue-key="MR !7100"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(3)

  await openPalette(page)
  const items = itemRows(page)
  const input = page.getByTestId(testIds.commandPaletteInput)

  await page.keyboard.type('hdr-701')
  await expect(items).toHaveCount(2)
  await expect(items.first()).toHaveAttribute('data-row-id', 'HDR-701')
  await expect(items.first()).toHaveAttribute('data-active', 'true')

  // The MR is reachable by its title and by its number, from the same field.
  await input.fill('bump')
  await expect(items).toHaveCount(1)
  await expect(items.first()).toHaveAttribute('data-row-id', 'review:7100')

  await input.fill('!7100')
  await expect(items).toHaveCount(1)
  await expect(items.first()).toHaveAttribute('data-row-id', 'review:7100')
})

test('search finds assigned tickets from the watchlist board too — it is not route-scoped', async ({
  page,
  world,
}) => {
  world.seedIssues([makeIssue({ key: 'HDR-702', summary: 'Cross-route find me' })])

  await page.goto('/watchlist?e2e=1')
  await expect(page.getByTestId(testIds.watchlistBoard)).toBeVisible()

  await openPalette(page)
  await page.keyboard.type('cross-route')

  const items = itemRows(page)
  await expect(items).toHaveCount(1)
  await expect(items.first()).toHaveAttribute('data-row-id', 'HDR-702')
})

test('a ticket that is both assigned and an MR we review appears once', async ({ page, world }) => {
  world.seedGitlabCurrentUser({ username: ME, displayName: 'Me' })
  world.seedIssues([makeIssue({ key: 'HDR-703', summary: 'Shared across two sources' })])
  // Authored by someone else with us as a reviewer → a real review card whose
  // jira.key matches the assigned issue above.
  world.seedMrs([
    makeMr({ iid: 7103, title: 'HDR-703: the MR', jiraKey: 'HDR-703', authorUsername: 'someone' }),
  ])
  world.seedMrReviewers(7103, [makeMrReviewer({ username: ME, state: 'unreviewed' })])
  world.seedMrApprovals(7103, makeApprovals())
  world.seedMrPipeline(7103, makePipeline())

  await page.goto('/?e2e=1')
  // The board itself shows both: the assigned card and the review card. The
  // palette is the surface that collapses them.
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(2)

  await openPalette(page)
  await page.keyboard.type('hdr-703')

  const items = itemRows(page)
  await expect(items).toHaveCount(1)
  // The assigned board issue survives dedupe, not the review card.
  await expect(items.first()).toHaveAttribute('data-row-id', 'HDR-703')
})

test('arrows move the highlight, wrapping at both ends; Enter opens the highlighted ticket', async ({
  page,
  world,
}) => {
  world.seedIssues([
    makeIssue({ key: 'HDR-710', summary: 'Apple one', statusName: 'Reviewed' }),
    makeIssue({ key: 'HDR-711', summary: 'Apple two', statusName: 'Reviewed' }),
  ])

  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(2)

  await openPalette(page)
  await page.keyboard.type('apple')

  // Two tickets plus the "Filter board by 'apple'" command — the highlight
  // walks all three as one flat list.
  const rows = paletteRows(page)
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toHaveAttribute('data-active', 'true')

  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(1)).toHaveAttribute('data-active', 'true')

  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(2)).toHaveAttribute('data-active', 'true')

  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(0)).toHaveAttribute('data-active', 'true')

  await page.keyboard.press('ArrowUp')
  await expect(rows.nth(2)).toHaveAttribute('data-active', 'true')

  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(0)).toHaveAttribute('data-active', 'true')

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId(testIds.commandPalette)).toHaveCount(0)
  await expect(page).toHaveURL(/issue=HDR-711/u)
})

test('j and k type into the query rather than navigating — the root level owns the input', async ({
  page,
  world,
}) => {
  world.seedIssues([
    makeIssue({ key: 'HDR-720', summary: 'Kodiak bear', statusName: 'Reviewed' }),
    makeIssue({ key: 'HDR-721', summary: 'Jackdaw', statusName: 'Reviewed' }),
  ])

  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(2)

  await openPalette(page)
  await page.keyboard.type('kod')

  await expect(page.getByTestId(testIds.commandPaletteInput)).toHaveValue('kod')
  const items = itemRows(page)
  await expect(items).toHaveCount(1)
  await expect(items.first()).toHaveAttribute('data-row-id', 'HDR-720')
})

import { test, expect } from '../fixtures/test'
import {
  makeApprovals,
  makeIssue,
  makeMr,
  makeMrReviewer,
  makePipeline,
} from '../fixtures/factories'
import { testIds } from '~/lib/testids'
import { itemRows, openPalette } from './open-palette'

const ME = 'me-gitlab'

const actionRows = (page: import('@playwright/test').Page) =>
  page.getByTestId(testIds.commandPaletteAction)

const actionRow = (page: import('@playwright/test').Page, kind: string) =>
  page.locator(`[data-testid="${testIds.commandPaletteAction}"][data-action-kind="${kind}"]`)

test('Enter on a result opens its action list; Backspace returns with the query intact', async ({
  page,
  world,
}) => {
  world.seedIssues([
    makeIssue({ key: 'HDR-901', summary: 'Apple one', statusName: 'Reviewed' }),
    makeIssue({ key: 'HDR-902', summary: 'Apple two', statusName: 'Reviewed' }),
  ])
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(2)

  await openPalette(page)
  await page.keyboard.type('apple')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')

  // The action list names the item it acts on.
  const header = page.getByTestId(testIds.commandPaletteItemHeader)
  await expect(header).toContainText('HDR-902')
  await expect(header).toContainText('Apple two')
  await expect(actionRows(page)).not.toHaveCount(0)

  // Each row prints its curated letter.
  await expect(actionRow(page, 'copy-issue-key')).toContainText('y')

  await page.keyboard.press('Backspace')
  await expect(page.getByTestId(testIds.commandPaletteItemHeader)).toHaveCount(0)
  // Query and the previously selected result both survived the round trip.
  await expect(page.getByTestId(testIds.commandPaletteInput)).toHaveValue('apple')
  await expect(itemRows(page).nth(1)).toHaveAttribute('data-active', 'true')

  // Escape from the action list closes the whole palette, not one level.
  await page.keyboard.press('Enter')
  await expect(page.getByTestId(testIds.commandPaletteItemHeader)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId(testIds.commandPalette)).toHaveCount(0)
})

test('only legal actions are listed — a ticket with no MR offers neither MR action', async ({
  page,
  world,
}) => {
  world.seedIssues([makeIssue({ key: 'HDR-903', summary: 'No MR here' })])
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)

  await openPalette(page)
  await page.keyboard.type('hdr-903')
  await page.keyboard.press('Enter')

  await expect(actionRow(page, 'open-detail')).toBeVisible()
  await expect(actionRow(page, 'copy-issue-key')).toBeVisible()
  await expect(actionRow(page, 'open-workspace')).toBeVisible()
  // Absent, not rendered disabled.
  await expect(actionRow(page, 'open-mr')).toHaveCount(0)
  await expect(actionRow(page, 'explain-mr')).toHaveCount(0)
  await expect(actionRow(page, 'focus-workspace')).toHaveCount(0)
  await expect(actionRow(page, 'discard-workspace')).toHaveCount(0)
})

test('a fake review card offers exactly Open MR and Explain MR', async ({ page, world }) => {
  world.seedGitlabCurrentUser({ username: ME, displayName: 'Me' })
  world.seedIssues([makeIssue({ key: 'HDR-904', summary: 'board seed' })])
  world.seedMrs([
    makeMr({ iid: 9040, title: 'chore: bump deps', authorUsername: 'someone', state: 'opened' }),
  ])
  world.seedMrReviewers(9040, [makeMrReviewer({ username: ME, state: 'unreviewed' })])
  world.seedMrApprovals(9040, makeApprovals())
  world.seedMrPipeline(9040, makePipeline())

  await page.goto('/?e2e=1')
  await expect(page.locator('[data-issue-key="MR !9040"]')).toBeVisible({ timeout: 15_000 })

  await openPalette(page)
  await page.keyboard.type('bump')
  await page.keyboard.press('Enter')

  await expect(actionRows(page)).toHaveCount(2)
  await expect(actionRow(page, 'open-mr')).toBeVisible()
  await expect(actionRow(page, 'explain-mr')).toBeVisible()
  await expect(actionRow(page, 'open-detail')).toHaveCount(0)
})

test('pressing a letter bound to an illegal action is a no-op — the palette stays open', async ({
  page,
  world,
}) => {
  world.seedIssues([makeIssue({ key: 'HDR-905', summary: 'No MR here either' })])
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)

  await openPalette(page)
  await page.keyboard.type('hdr-905')
  await page.keyboard.press('Enter')
  await expect(actionRow(page, 'open-mr')).toHaveCount(0)

  // `m` is Open MR, which is not legal here. Nothing happens, and in particular
  // the palette does not close and the key does not reach another handler.
  await page.keyboard.press('m')
  await expect(page.getByTestId(testIds.commandPalette)).toBeVisible()
  await expect(page.getByTestId(testIds.commandPaletteItemHeader)).toContainText('HDR-905')
  await expect(page).not.toHaveURL(/issue=/u)
})

test('a letter runs its action — `d` opens the detail panel', async ({ page, world }) => {
  world.seedIssues([makeIssue({ key: 'HDR-906', summary: 'Open me by keyboard' })])
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)

  await openPalette(page)
  await page.keyboard.type('hdr-906')
  await page.keyboard.press('Enter')
  await page.keyboard.press('d')

  await expect(page.getByTestId(testIds.commandPalette)).toHaveCount(0)
  await expect(page).toHaveURL(/issue=HDR-906/u)
})

test('`n` opens the ticket with its notes pane already open', async ({ page, world }) => {
  world.seedIssues([makeIssue({ key: 'HDR-907', summary: 'Notes by keyboard' })])
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)

  await openPalette(page)
  await page.keyboard.type('hdr-907')
  await page.keyboard.press('Enter')
  await page.keyboard.press('n')

  await expect(page).toHaveURL(/issue=HDR-907/u)
  await expect(page).toHaveURL(/notes=true/u)
  await expect(page.getByTestId(testIds.notesPanel)).toBeVisible()
})

test('`y` copies the issue key and says so', async ({ page, world, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  world.seedIssues([makeIssue({ key: 'HDR-908', summary: 'Copy my key' })])
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)

  await openPalette(page)
  await page.keyboard.type('hdr-908')
  await page.keyboard.press('Enter')
  await page.keyboard.press('y')

  await expect(page.getByText('Issue key copied')).toBeVisible()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('HDR-908')
})

test('`j` and `k` navigate the action list, where there is no query field to type into', async ({
  page,
  world,
}) => {
  world.seedIssues([makeIssue({ key: 'HDR-909', summary: 'Navigate my actions' })])
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)

  await openPalette(page)
  await page.keyboard.type('hdr-909')
  await page.keyboard.press('Enter')

  const rows = actionRows(page)
  await expect(rows.nth(0)).toHaveAttribute('data-active', 'true')
  await page.keyboard.press('j')
  await expect(rows.nth(1)).toHaveAttribute('data-active', 'true')
  await page.keyboard.press('k')
  await expect(rows.nth(0)).toHaveAttribute('data-active', 'true')
})

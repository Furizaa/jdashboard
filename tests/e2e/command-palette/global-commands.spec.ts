import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'
import { testIds } from '~/lib/testids'
import { commandRow, openPalette } from './open-palette'

test('"New Ticket" opens quick-create through the command bus', async ({ page, world }) => {
  world.seedIssues([makeIssue({ key: 'HDR-960', summary: 'Board seed' })])
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)

  await openPalette(page)
  await page.keyboard.type('new ticket')
  await expect(commandRow(page, 'new-ticket')).toHaveCount(1)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')

  await expect(page.getByTestId(testIds.commandPalette)).toHaveCount(0)
  await expect(page.getByLabel('Summary, prefixed with FE colon')).toBeVisible()
})

test('a command is findable by a synonym, not only by its name', async ({ page, world }) => {
  world.seedIssues([makeIssue({ key: 'HDR-961', summary: 'Board seed' })])
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)

  await openPalette(page)
  // "create" is a synonym of New Ticket and appears in none of its label words.
  await page.keyboard.type('create')
  await expect(commandRow(page, 'new-ticket')).toHaveCount(1)

  await page.getByTestId(testIds.commandPaletteInput).fill('reload')
  await expect(commandRow(page, 'refresh')).toHaveCount(1)
})

test('"Manage Tags" and "Bulk Refine" open their header modals', async ({ page, world }) => {
  world.seedIssues([makeIssue({ key: 'HDR-962', summary: 'Board seed' })])
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)

  await openPalette(page)
  await page.keyboard.type('manage tags')
  await commandRow(page, 'manage-tags').click()
  await expect(page.getByTestId(testIds.tagManagerModal)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId(testIds.tagManagerModal)).toHaveCount(0)

  await openPalette(page)
  await page.keyboard.type('bulk refine')
  await commandRow(page, 'bulk-refine').click()
  await expect(page.getByTestId(testIds.bulkRefineModal)).toBeVisible()
})

test('"Configure Lanes" is offered on the watchlist board and absent on the main board', async ({
  page,
  world,
}) => {
  world.seedIssues([makeIssue({ key: 'HDR-963', summary: 'Board seed' })])

  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)
  await openPalette(page)
  await page.keyboard.type('lanes')
  // No button on `/` means no registered opener, so the command is not offered
  // at all rather than offered-and-inert.
  await expect(commandRow(page, 'configure-lanes')).toHaveCount(0)
  await page.keyboard.press('Escape')

  await page.goto('/watchlist?e2e=1')
  await expect(page.getByTestId(testIds.watchlistBoard)).toBeVisible()
  await openPalette(page)
  await page.keyboard.type('lanes')
  await commandRow(page, 'configure-lanes').click()
  await expect(page.getByTestId(testIds.laneConfigModal)).toBeVisible()
})

test('board navigation commands leave out the board you are already on', async ({
  page,
  world,
}) => {
  world.seedIssues([makeIssue({ key: 'HDR-964', summary: 'Board seed' })])

  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)
  await openPalette(page)
  await page.keyboard.type('go to')
  await expect(commandRow(page, 'go-to-watchlist')).toHaveCount(1)
  await expect(commandRow(page, 'go-to-board')).toHaveCount(0)

  await commandRow(page, 'go-to-watchlist').click()
  await expect(page).toHaveURL(/\/watchlist/u)
  await expect(page.getByTestId(testIds.watchlistBoard)).toBeVisible()

  await openPalette(page)
  await page.keyboard.type('go to')
  await expect(commandRow(page, 'go-to-board')).toHaveCount(1)
  await expect(commandRow(page, 'go-to-watchlist')).toHaveCount(0)
})

test('"Only Workspace" is main-board only and its label reflects the current state', async ({
  page,
  world,
}) => {
  world.seedIssues([makeIssue({ key: 'HDR-965', summary: 'Board seed' })])

  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)
  await openPalette(page)
  await page.keyboard.type('workspace')
  const toggle = commandRow(page, 'toggle-only-workspace')
  await expect(toggle).toContainText('Show only tickets with an open workspace')
  await toggle.click()

  // The header toggle is now on, and the command inverts.
  await expect(page.getByTestId(testIds.onlyWorkspaceToggle)).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await openPalette(page)
  await page.keyboard.type('workspace')
  await expect(commandRow(page, 'toggle-only-workspace')).toContainText('Show all tickets')
  await page.keyboard.press('Escape')

  await page.goto('/watchlist?e2e=1')
  await expect(page.getByTestId(testIds.watchlistBoard)).toBeVisible()
  await openPalette(page)
  await page.keyboard.type('workspace')
  await expect(commandRow(page, 'toggle-only-workspace')).toHaveCount(0)
})

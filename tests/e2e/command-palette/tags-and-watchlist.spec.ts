import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'
import { testIds } from '~/lib/testids'
import { itemRows, openPalette } from './open-palette'

const KEY = 'HDR-980'

const actionRow = (page: import('@playwright/test').Page, kind: string) =>
  page.locator(`[data-testid="${testIds.commandPaletteAction}"][data-action-kind="${kind}"]`)

const subItems = (page: import('@playwright/test').Page) =>
  page.getByTestId(testIds.commandPaletteSubItem)

async function openActionsFor(page: import('@playwright/test').Page, key: string) {
  await openPalette(page)
  await page.keyboard.type(key.toLowerCase())
  await page.keyboard.press('Enter')
  await expect(page.getByTestId(testIds.commandPaletteItemHeader)).toContainText(key)
}

test('`t` toggles a tag in both directions, and the chip appears on the card', async ({
  page,
  world,
  local,
}) => {
  world.seedIssues([makeIssue({ key: KEY, summary: 'Tag me', statusName: 'Reviewed' })])
  await local.seedTags([
    { id: 'urgent', name: 'Urgent', colorId: 'red' },
    { id: 'later', name: 'Later', colorId: 'slate' },
  ])

  await page.goto('/?e2e=1')
  const card = page.locator(`[data-issue-key="${KEY}"]`)
  await expect(card).toBeVisible()
  await expect(card.getByTestId(testIds.cardTagChip)).toHaveCount(0)

  await openActionsFor(page, KEY)
  await page.keyboard.press('t')
  await expect(subItems(page)).toHaveCount(2)
  await expect(subItems(page).nth(0)).toContainText('Urgent')
  await expect(subItems(page).nth(0)).not.toHaveAttribute('data-checked', 'true')

  // Attach.
  await page.keyboard.press('Enter')
  await expect(subItems(page).nth(0)).toHaveAttribute('data-checked', 'true')
  // The sub-list stays open so several tags can be set in one visit.
  await expect(page.getByTestId(testIds.commandPaletteItemHeader)).toContainText('Tags')
  await expect(card.getByTestId(testIds.cardTagChip)).toHaveCount(1)
  await expect(card.getByTestId(testIds.cardTagChip)).toContainText('Urgent')

  // A second tag, by digit, in the same visit.
  await page.keyboard.press('2')
  await expect(subItems(page).nth(1)).toHaveAttribute('data-checked', 'true')
  await expect(card.getByTestId(testIds.cardTagChip)).toHaveCount(2)

  // Detach the first again — the same key, the other direction.
  await page.keyboard.press('1')
  await expect(subItems(page).nth(0)).not.toHaveAttribute('data-checked', 'true')
  await expect(card.getByTestId(testIds.cardTagChip)).toHaveCount(1)
})

test('`t` is absent when no tags are defined', async ({ page, world }) => {
  world.seedIssues([makeIssue({ key: KEY, summary: 'No tags here', statusName: 'Reviewed' })])

  await page.goto('/?e2e=1')
  await expect(page.locator(`[data-issue-key="${KEY}"]`)).toBeVisible()

  await openActionsFor(page, KEY)
  // An empty tag list is a dead end; Manage Tags is the command to reach for.
  await expect(actionRow(page, 'tags')).toHaveCount(0)
  await page.keyboard.press('t')
  await expect(page.getByTestId(testIds.commandPaletteItemHeader)).not.toContainText('Tags')
})

test('`w` adds and removes the ticket from the watchlist, flipping its own label', async ({
  page,
  world,
}) => {
  world.seedIssues([makeIssue({ key: KEY, summary: 'Watch me', statusName: 'Reviewed' })])

  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)

  await openActionsFor(page, KEY)
  await expect(actionRow(page, 'watchlist-toggle')).toContainText('Add to Watchlist')
  await page.keyboard.press('w')
  await expect(page.getByTestId(testIds.commandPalette)).toHaveCount(0)

  // The label and the behaviour both flip on membership. (The board itself shows
  // no second card: an assigned ticket that is also watchlisted keeps its own
  // card rather than appearing twice — see `placeWatchlistCards`.)
  await openActionsFor(page, KEY)
  await expect(actionRow(page, 'watchlist-toggle')).toContainText('Remove from Watchlist')

  // And it is still one row in the palette, not two, now that the same ticket
  // arrives from two sources.
  await page.keyboard.press('Backspace')
  await expect(itemRows(page)).toHaveCount(1)
  await page.keyboard.press('Enter')

  await page.keyboard.press('w')
  await openActionsFor(page, KEY)
  await expect(actionRow(page, 'watchlist-toggle')).toContainText('Add to Watchlist')
})

test('a ticket that is assigned and watchlisted is one palette row with Remove offered', async ({
  page,
  world,
  local,
}) => {
  world.seedIssues([makeIssue({ key: KEY, summary: 'Advisory work', statusName: 'Reviewed' })])
  await local.seedWatchlist([KEY])

  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)

  await openPalette(page)
  await page.keyboard.type('advisory')
  // Assigned *and* watchlisted, found once — `dedupeWorkItems` against the live
  // watchlist, not a fixture.
  await expect(itemRows(page)).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(actionRow(page, 'watchlist-toggle')).toContainText('Remove from Watchlist')
})

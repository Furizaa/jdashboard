import { http, HttpResponse } from 'msw'
import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'
import { testIds } from '~/lib/testids'
import { openPalette } from './open-palette'

const KEY = 'HDR-950'
const TRANSITIONS_PATH = `/rest/api/3/issue/${KEY}/transitions`

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

test('`s` opens a transition sub-list, fetched on entering the item, and picking one moves the card', async ({
  page,
  world,
  mocks,
}) => {
  world.seedIssues([makeIssue({ key: KEY, summary: 'Move me', statusName: 'Reviewed' })])
  world.seedTransitions(KEY, [
    { id: 't-impl', name: 'Start Implementation', toStatusName: 'In Implementation' },
    { id: 't-review', name: 'Send to Review', toStatusName: 'In Code Review' },
  ])

  await page.goto('/?e2e=1')
  const card = page.locator(`[data-issue-key="${KEY}"]`)
  await expect(card).toContainText('Ready to Pick')

  const transitionGets = () =>
    mocks.requests().filter((r) => r.method === 'GET' && r.path === TRANSITIONS_PATH).length

  // Typing must not fan out a request per result row.
  await openPalette(page)
  await page.keyboard.type('hdr-9')
  expect(transitionGets()).toBe(0)

  // Entering the item is what triggers the fetch.
  await page.keyboard.type('50')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId(testIds.commandPaletteItemHeader)).toContainText(KEY)
  await expect.poll(transitionGets).toBeGreaterThanOrEqual(1)

  await page.keyboard.press('s')
  await expect(page.getByTestId(testIds.commandPaletteItemHeader)).toContainText('Change Status')
  await expect(subItems(page)).toHaveCount(2)
  // Labelled the way the status pill's own dropdown labels them.
  await expect(subItems(page).nth(1)).toContainText('In Code Review')

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')

  await expect(page.getByTestId(testIds.commandPalette)).toHaveCount(0)
  await expect(card).toContainText('In Code Review')
})

test('digits 1-9 pick among the transitions', async ({ page, world }) => {
  world.seedIssues([makeIssue({ key: KEY, summary: 'Digit me', statusName: 'Reviewed' })])
  world.seedTransitions(KEY, [
    { id: 't-impl', name: 'Start Implementation', toStatusName: 'In Implementation' },
    { id: 't-review', name: 'Send to Review', toStatusName: 'In Code Review' },
  ])

  await page.goto('/?e2e=1')
  const card = page.locator(`[data-issue-key="${KEY}"]`)
  await expect(card).toBeVisible()

  await openActionsFor(page, KEY)
  await page.keyboard.press('s')
  await expect(subItems(page)).toHaveCount(2)
  // Each row prints its digit.
  await expect(subItems(page).nth(0)).toContainText('1')

  await page.keyboard.press('2')
  await expect(page.getByTestId(testIds.commandPalette)).toHaveCount(0)
  await expect(card).toContainText('In Code Review')
})

test('a failed transitions fetch is visibly a failure, not an empty list', async ({
  page,
  world,
  mocks,
}) => {
  world.seedIssues([makeIssue({ key: KEY, summary: 'Break me', statusName: 'Reviewed' })])
  world.seedTransitions(KEY, [
    { id: 't-impl', name: 'Start Implementation', toStatusName: 'In Implementation' },
  ])

  await page.goto('/?e2e=1')
  await expect(page.locator(`[data-issue-key="${KEY}"]`)).toBeVisible()

  mocks.use(
    http.get(`*${TRANSITIONS_PATH}`, () =>
      HttpResponse.json({ errorMessages: ['boom'] }, { status: 500 }),
    ),
  )

  await openActionsFor(page, KEY)
  await page.keyboard.press('s')

  await expect(page.getByTestId(testIds.commandPaletteSubFailed)).toBeVisible()
  await expect(page.getByTestId(testIds.commandPaletteSubEmpty)).toHaveCount(0)
  await expect(subItems(page)).toHaveCount(0)
})

test('a ticket with no transitions is not offered `s` at all', async ({ page, world }) => {
  world.seedIssues([makeIssue({ key: KEY, summary: 'Nowhere to go', statusName: 'Reviewed' })])
  world.seedTransitions(KEY, [])

  await page.goto('/?e2e=1')
  await expect(page.locator(`[data-issue-key="${KEY}"]`)).toBeVisible()

  await openActionsFor(page, KEY)
  // The fetch resolves to nothing, and the action disappears rather than
  // offering a list that turns out to be empty.
  await expect(actionRow(page, 'change-status')).toHaveCount(0)

  // And the letter is then a no-op, not a fall-through.
  await page.keyboard.press('s')
  await expect(page.getByTestId(testIds.commandPaletteItemHeader)).toContainText(KEY)
  await expect(page.getByTestId(testIds.commandPaletteItemHeader)).not.toContainText(
    'Change Status',
  )
})

test('the navigation stack is three deep and pops exactly one level per press', async ({
  page,
  world,
}) => {
  world.seedIssues([
    makeIssue({ key: KEY, summary: 'Deep stack', statusName: 'Reviewed' }),
    makeIssue({ key: 'HDR-951', summary: 'Deep stack sibling', statusName: 'Reviewed' }),
  ])
  world.seedTransitions(KEY, [
    { id: 't-impl', name: 'Start Implementation', toStatusName: 'In Implementation' },
  ])

  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(2)

  await openPalette(page)
  await page.keyboard.type('deep stack')
  await page.keyboard.press('Enter')
  await page.keyboard.press('s')

  const header = page.getByTestId(testIds.commandPaletteItemHeader)
  await expect(header).toContainText('Change Status')

  // Back out of the sub-list: still on the item's actions.
  await page.keyboard.press('Backspace')
  await expect(header).toContainText(KEY)
  await expect(header).not.toContainText('Change Status')

  // Back out of the actions: results again, with the query untouched.
  await page.keyboard.press('Backspace')
  await expect(page.getByTestId(testIds.commandPaletteItemHeader)).toHaveCount(0)
  await expect(page.getByTestId(testIds.commandPaletteInput)).toHaveValue('deep stack')

  // One more press has nothing above it to pop, and does not close.
  await page.keyboard.press('Backspace')
  await expect(page.getByTestId(testIds.commandPalette)).toBeVisible()
})

test('Escape closes the whole palette from the deepest level', async ({ page, world }) => {
  world.seedIssues([makeIssue({ key: KEY, summary: 'Escape me', statusName: 'Reviewed' })])
  world.seedTransitions(KEY, [
    { id: 't-impl', name: 'Start Implementation', toStatusName: 'In Implementation' },
  ])

  await page.goto('/?e2e=1')
  await expect(page.locator(`[data-issue-key="${KEY}"]`)).toBeVisible()

  await openActionsFor(page, KEY)
  await page.keyboard.press('s')
  await expect(page.getByTestId(testIds.commandPaletteItemHeader)).toContainText('Change Status')

  await page.keyboard.press('Escape')
  await expect(page.getByTestId(testIds.commandPalette)).toHaveCount(0)
})

import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'
import { testIds } from '~/lib/testids'
import { openPalette } from './open-palette'

const KEY = 'HDR-970'

async function openActions(page: import('@playwright/test').Page) {
  await openPalette(page)
  await page.keyboard.type(KEY.toLowerCase())
  await page.keyboard.press('Enter')
  await expect(page.getByTestId(testIds.commandPaletteItemHeader)).toContainText(KEY)
}

test('`r` lands in the refine modal with the notes pane open, and clears the param', async ({
  page,
  world,
}) => {
  world.seedIssues([makeIssue({ key: KEY, summary: 'Refine me by keyboard' })])
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)

  await openActions(page)
  await page.keyboard.press('r')

  await expect(page.getByTestId(testIds.notesPanel)).toBeVisible()
  await expect(page.getByTestId(testIds.notesRefineModal)).toBeVisible()
  // The param is consumed the moment the panel acts on it.
  await expect(page).toHaveURL(/issue=HDR-970/u)
  await expect(page).toHaveURL(/notes=true/u)
  await expect(page).not.toHaveURL(/ai=/u)
})

test('`a` lands in the ask modal', async ({ page, world }) => {
  world.seedIssues([makeIssue({ key: KEY, summary: 'Ask about me' })])
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)

  await openActions(page)
  await page.keyboard.press('a')

  await expect(page.getByTestId(testIds.notesAskModal)).toBeVisible()
  await expect(page).not.toHaveURL(/ai=/u)
})

test('a reload does not silently reopen the modal', async ({ page, world }) => {
  world.seedIssues([makeIssue({ key: KEY, summary: 'Reload me' })])
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)

  await openActions(page)
  await page.keyboard.press('r')
  await expect(page.getByTestId(testIds.notesRefineModal)).toBeVisible()

  // The URL is already `?issue=…&notes=true` with no `ai`, so the reload lands
  // on the ticket with its notes open and no modal.
  await page.reload()
  await expect(page.getByTestId(testIds.notesPanel)).toBeVisible()
  await expect(page.getByTestId(testIds.notesRefineModal)).toHaveCount(0)
})

test('the back button does not silently reopen the modal either', async ({ page, world }) => {
  world.seedIssues([makeIssue({ key: KEY, summary: 'Go back from me' })])
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)

  await openActions(page)
  await page.keyboard.press('r')
  await expect(page.getByTestId(testIds.notesRefineModal)).toBeVisible()

  // Clearing the param *replaces* rather than pushes, so `?ai=` is not sitting
  // one step back in history waiting to be revisited.
  await page.goBack()
  await expect(page).not.toHaveURL(/ai=/u)
  await expect(page.getByTestId(testIds.notesRefineModal)).toHaveCount(0)
})

test('a hand-typed ai param opens the modal once and implies the notes pane', async ({
  page,
  world,
}) => {
  world.seedIssues([makeIssue({ key: KEY, summary: 'Deep linked' })])

  // No `notes=true`: the validator adds it, because NotesPanel is where the two
  // modals are mounted.
  await page.goto(`/?e2e=1&issue=${KEY}&ai=ask`)
  await expect(page.getByTestId(testIds.notesPanel)).toBeVisible()
  await expect(page.getByTestId(testIds.notesAskModal)).toBeVisible()
  await expect(page).not.toHaveURL(/ai=/u)
})

test('an unknown ai value is ignored rather than trusted', async ({ page, world }) => {
  world.seedIssues([makeIssue({ key: KEY, summary: 'Bad param' })])

  await page.goto(`/?e2e=1&issue=${KEY}&ai=nonsense`)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByTestId(testIds.notesRefineModal)).toHaveCount(0)
  await expect(page.getByTestId(testIds.notesAskModal)).toHaveCount(0)
  // And with no `ai`, nothing implied the notes pane either.
  await expect(page.getByTestId(testIds.notesPanel)).toHaveCount(0)
})

import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'
import { testIds } from '~/lib/testids'
import { ACTION_LABELS, ACTION_SHORTCUTS, type ActionKind } from '~/kernel'
import { openPalette } from './open-palette'

const helpKey = (page: import('@playwright/test').Page, kind: string) =>
  page.locator(`[data-testid="${testIds.commandPaletteHelpKey}"][data-action-kind="${kind}"]`)

test('`?` opens a shortcut reference generated from the kernel map', async ({ page, world }) => {
  world.seedIssues([makeIssue({ key: 'HDR-990', summary: 'Board seed' })])
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)

  await openPalette(page)
  await page.keyboard.press('?')

  const help = page.getByTestId(testIds.commandPaletteHelp)
  await expect(help).toBeVisible()

  // Every action in `kernel/commands.ts`, with its letter and its label — the
  // table is generated from that map, so this is what "cannot drift" means.
  const kinds = Object.keys(ACTION_SHORTCUTS) as ActionKind[]
  await expect(page.getByTestId(testIds.commandPaletteHelpKey)).toHaveCount(kinds.length)
  await Promise.all(
    kinds.flatMap((kind) => [
      expect(helpKey(page, kind)).toHaveText(ACTION_SHORTCUTS[kind]),
      expect(help).toContainText(ACTION_LABELS[kind]),
    ]),
  )

  // It names its own source of truth.
  await expect(page.getByTestId(testIds.commandPaletteFooter)).toContainText('kernel/commands.ts')
})

test('the help view pops back to the results with the query intact', async ({ page, world }) => {
  world.seedIssues([
    makeIssue({ key: 'HDR-991', summary: 'Apple one' }),
    makeIssue({ key: 'HDR-992', summary: 'Apple two' }),
  ])
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(2)

  await openPalette(page)
  await page.keyboard.press('?')
  await expect(page.getByTestId(testIds.commandPaletteHelp)).toBeVisible()

  await page.keyboard.press('Backspace')
  await expect(page.getByTestId(testIds.commandPaletteHelp)).toHaveCount(0)
  await expect(page.getByTestId(testIds.commandPaletteInput)).toBeFocused()

  await page.keyboard.press('?')
  await expect(page.getByTestId(testIds.commandPaletteHelp)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId(testIds.commandPalette)).toHaveCount(0)
})

test('a question mark can still be typed into the query', async ({ page, world }) => {
  world.seedIssues([makeIssue({ key: 'HDR-993', summary: 'Does it work?' })])
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)

  await openPalette(page)
  await page.keyboard.type('work?')

  // `?` only opens the reference from an empty query — otherwise the palette
  // could not search for a question mark.
  await expect(page.getByTestId(testIds.commandPaletteHelp)).toHaveCount(0)
  await expect(page.getByTestId(testIds.commandPaletteInput)).toHaveValue('work?')
})

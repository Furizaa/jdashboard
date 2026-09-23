import { expect, type Locator, type Page } from '@playwright/test'
import { testIds } from '~/lib/testids'

/**
 * Press ⌘K and wait for the palette. The keypress is only honoured once React
 * has hydrated and attached the window listener, so a test that fires it
 * straight after `goto` races the hydration — wait for something the board
 * rendered first, then call this.
 */
export async function openPalette(page: Page): Promise<void> {
  await page.keyboard.press('ControlOrMeta+KeyK')
  await expect(page.getByTestId(testIds.commandPalette)).toBeVisible()
  await expect(page.getByTestId(testIds.commandPaletteInput)).toBeFocused()
}

/** Every row, work items and board-level commands alike, in keyboard order. */
export function paletteRows(page: Page): Locator {
  return page.getByTestId(testIds.commandPaletteRow)
}

/** Only the work-item rows — the command rows always sit beneath them. */
export function itemRows(page: Page): Locator {
  return page.locator(`[data-testid="${testIds.commandPaletteRow}"][data-row-kind="item"]`)
}

/** Only the board-level command rows. */
export function commandRows(page: Page): Locator {
  return page.locator(`[data-testid="${testIds.commandPaletteRow}"][data-row-kind="command"]`)
}

/**
 * One command row by its id. Matching by text is not enough: "Filter board by
 * 'new ticket'" also contains "New Ticket".
 */
export function commandRow(page: Page, id: string): Locator {
  return page.locator(`[data-testid="${testIds.commandPaletteRow}"][data-row-id="command:${id}"]`)
}

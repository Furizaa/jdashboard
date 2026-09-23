import { expect, type Locator, type Page } from '@playwright/test'
import { testIds } from '~/lib/testids'

/**
 * Press ⌘K and wait for the palette.
 *
 * The keypress is only honoured once React has hydrated and attached the window
 * listener, so it has to wait for that first. The header's sync indicator is the
 * signal: it reads "Not synced" from the server and only changes once the
 * *client-side* board query has resolved, which is strictly after hydration —
 * and it is on both board routes, where the boards themselves are not always
 * rendered (an empty watchlist has no lanes to show).
 */
export async function openPalette(page: Page): Promise<void> {
  const palette = page.getByTestId(testIds.commandPalette)
  await expect(page.getByTestId(testIds.syncIndicator)).toContainText(/Synced|Sync failed/u)
  // Retried, because a press can also land on a route component that is about to
  // unmount: `/` and `/watchlist` are separate routes, so switching boards
  // remounts the shell and resets the palette. Only pressed while the palette is
  // closed, so a retry can never toggle an open one shut.
  await expect(async () => {
    if ((await palette.count()) === 0) await page.keyboard.press('ControlOrMeta+KeyK')
    await expect(palette).toBeVisible({ timeout: 500 })
  }).toPass({ timeout: 15_000 })
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

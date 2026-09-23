import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'
import { testIds } from '~/lib/testids'
import { openPalette } from './open-palette'

test('cmd+k opens the palette and focuses its query field; esc and cmd+k both close it', async ({
  page,
  world,
}) => {
  world.seedIssues([makeIssue({ key: 'HDR-601', summary: 'HDR-601: Apple cobbler' })])
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)

  const palette = page.getByTestId(testIds.commandPalette)
  const input = page.getByTestId(testIds.commandPaletteInput)
  await expect(palette).toHaveCount(0)

  await openPalette(page)
  await expect(input).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(palette).toHaveCount(0)

  // ⌘K is a toggle, not just an opener.
  await page.keyboard.press('ControlOrMeta+KeyK')
  await expect(palette).toBeVisible()
  await page.keyboard.press('ControlOrMeta+KeyK')
  await expect(palette).toHaveCount(0)
})

test('cmd+k does not hijack focus while the user is typing in another text input', async ({
  page,
  world,
}) => {
  world.seedIssues([makeIssue({ key: 'HDR-602', summary: 'HDR-602: Banana split' })])
  await page.goto('/?e2e=1')

  // Quick-create's summary field is a real text input in the app shell.
  await page.getByRole('button', { name: /New/u }).click()
  const summary = page.getByLabel('Summary, prefixed with FE colon')
  await summary.click()
  await expect(summary).toBeFocused()

  await page.keyboard.press('ControlOrMeta+KeyK')

  await expect(page.getByTestId(testIds.commandPalette)).toHaveCount(0)
  await expect(summary).toBeFocused()
})

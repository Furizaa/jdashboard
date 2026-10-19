import { expect, test } from '../fixtures/test'
import { testIds } from '~/lib/testids'
import { DEMO_CHART_ID, openDemoChart, row, seedDemoChart, seedDemoIssues } from './chart-fixture'

// Clicking a mirrored lane opens the **real** ticket reader over the chart —
// ADF, comments, relationships, transitions — because that is already the best
// ticket reader in the app, and reimplementing a worse one beside it was the
// only alternative (ADR-0012 §10).
//
// This is the first time ADR-0009's `overlay` slot is filled outside `AppShell`,
// and the thing worth pinning is that ⌘K keeps working above it: `AppChrome`
// mounts the palette host *after* the overlay, and that order is the whole
// mechanism. A regression there is invisible until someone presses ⌘K with a
// ticket open, which is exactly when they need it.

test.beforeEach(async ({ local, world }) => {
  await seedDemoChart(local)
  seedDemoIssues(world)
})

test('clicking a jira lane opens the ticket panel over the chart, chart-relatively', async ({
  page,
}) => {
  await openDemoChart(page)

  // A **local** lane has no ticket to open, so it stays plain text rather than
  // becoming a button that would do nothing.
  await expect(row(page, 'tier-migration').getByTestId(testIds.ganttJiraLane)).toHaveCount(0)

  await row(page, 'geo-142').getByTestId(testIds.ganttJiraLane).click()

  // Deep-linked the way a card deep-links on a board — and the chart stays in
  // the URL, so closing the panel returns to the chart and not to the list.
  await expect(page).toHaveURL(new RegExp(`chart=${DEMO_CHART_ID}.*issue=GEO-142`, 'u'))
  const panel = page.getByRole('dialog')
  await expect(panel).toBeVisible({ timeout: 15_000 })
  await expect(panel).toContainText('GEO-142')
  await expect(panel).toContainText('Tier lookup is cached per region')

  // The chart is still behind it, which is the point of an overlay.
  await expect(row(page, 'geo-141')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`chart=${DEMO_CHART_ID}`, 'u'))
  await expect(page).not.toHaveURL(/issue=/u)
})

test('⌘K still works above the open panel', async ({ page }) => {
  await page.goto(`/gantt?e2e=1&chart=${DEMO_CHART_ID}&issue=GEO-143`)
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 })

  // Retried rather than pressed once: the key is only honoured once React has
  // hydrated and attached the window listener, and this surface has no sync
  // indicator to wait on — it is not a board.
  const palette = page.getByTestId(testIds.commandPalette)
  await expect(async () => {
    if ((await palette.count()) === 0) await page.keyboard.press('ControlOrMeta+KeyK')
    await expect(palette).toBeVisible({ timeout: 500 })
  }).toPass({ timeout: 15_000 })
  await expect(page.getByTestId(testIds.commandPaletteInput)).toBeFocused()

  // It searches every work item from here too — the palette drives surfaces, it
  // does not belong to one.
  await page.keyboard.type('breakdown drawer')
  await expect(
    page.locator(`[data-testid="${testIds.commandPaletteRow}"][data-row-kind="item"]`).first(),
  ).toContainText('Price breakdown drawer')

  await page.keyboard.press('Escape')
  await expect(palette).toHaveCount(0)
  // The chart is still there underneath. (Escape reaches the panel as well as
  // the palette — both listen for it — so this does not assert that the panel
  // survived, only that the surface did.)
  await expect(page.getByTestId(testIds.ganttSurface)).toBeVisible()
})

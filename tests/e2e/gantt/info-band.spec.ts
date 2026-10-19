import { expect, test } from '../fixtures/test'
import { testIds } from '~/lib/testids'
import { openDemoChart, row, seedDemoChart, seedDemoIssues } from './chart-fixture'
import type { Locator, Page } from '@playwright/test'

// A lane's attached document, opened inline under the lane (ADR-0012 §10).
//
// A side panel was rejected for the body: it covers the right third of the time
// axis, which is the future, which is the part being looked at. Inline also
// keeps two PRDs comparable in one scroll context, which is what the architect
// came to do — so this spec opens two at once and checks both are there.
//
// The band's fixed height is load-bearing rather than cosmetic: `GanttArrows`
// places a row by counting the rows above it, so a band that grew with its
// content would mean measuring the DOM to draw an arrow. The escape from the cap
// is therefore the full view, not a taller band.

/** The band's total outer height, as `InfoBand.tsx` declares it. */
const BAND_HEIGHT = 260

const band = (page: Page, nodeId: string): Locator =>
  page.locator(`[data-testid="${testIds.ganttInfoBand}"][data-node-id="${nodeId}"]`)

const toggle = (page: Page, nodeId: string): Locator =>
  page.locator(`[data-testid="${testIds.ganttInfoToggle}"][data-node-id="${nodeId}"]`)

test.beforeEach(async ({ local, world }) => {
  // Both halves of the world this surface reads: the chart on disk, and the
  // tickets its mirrored lanes stand for. The `world` fixture is also what
  // installs the MSW sidecar's state — without it `getMyself` has nothing to
  // answer and `AuthGate` covers the app before a chart is ever drawn.
  await seedDemoChart(local)
  seedDemoIssues(world)
})

test('the band is closed on arrival, and only lanes with a document offer one', async ({
  page,
}) => {
  await openDemoChart(page)

  // No band open on arrival: a chart of forty lanes must not fetch forty PRDs to
  // draw a column of titles, and a body is read only once a band asks.
  await expect(page.getByTestId(testIds.ganttInfoBand)).toHaveCount(0)

  // `hasBody` is derived from the presence of `bodies/<id>.md`, so the
  // affordance is absent — not disabled — on a lane with nothing to show.
  await expect(toggle(page, 'tier-migration')).toBeVisible()
  await expect(toggle(page, 'billing-cutover')).toBeVisible()
  await expect(toggle(page, 'pricing-api')).toHaveCount(0)
  await expect(toggle(page, 'geo-141')).toHaveCount(0)
})

test('opening a band renders the document inline, height-capped, under its own lane', async ({
  page,
}) => {
  await openDemoChart(page)

  await toggle(page, 'tier-migration').click()
  const opened = band(page, 'tier-migration')
  await expect(opened).toBeVisible()
  await expect(toggle(page, 'tier-migration')).toHaveAttribute('aria-expanded', 'true')

  // Markdown, with GFM: headings, emphasis and a table, rendered rather than
  // printed as source.
  await expect(opened.getByRole('heading', { name: 'Tier migration' })).toBeVisible()
  await expect(opened.locator('strong', { hasText: 'four tiers' })).toBeVisible()
  await expect(opened.locator('th', { hasText: 'Owner' })).toBeVisible()

  // Capped, with its own scrollbar — a fixed height both this and the arrow
  // overlay agree on, not a `max-height` that settles wherever it lands.
  const box = await opened.boundingBox()
  if (box === null) throw new Error('the open band has no box')
  expect(Math.round(box.height)).toBe(BAND_HEIGHT)

  // Inline *under the lane*: the band sits between its own row and the next one.
  const nextLaneTop = (await row(page, 'billing-cutover').boundingBox())?.y ?? 0
  const laneTop = (await row(page, 'tier-migration').boundingBox())?.y ?? 0
  expect(box.y).toBeGreaterThan(laneTop)
  expect(nextLaneTop).toBeGreaterThan(box.y)

  // Two PRDs comparable in one scroll context, which is the reason for inline.
  await toggle(page, 'billing-cutover').click()
  await expect(band(page, 'tier-migration')).toBeVisible()
  await expect(band(page, 'billing-cutover')).toContainText('Invoices start carrying the tier')

  await toggle(page, 'tier-migration').click()
  await expect(band(page, 'tier-migration')).toHaveCount(0)
  await expect(band(page, 'billing-cutover')).toBeVisible()
})

test('the band escapes its cap into a full view of the same document', async ({ page }) => {
  await openDemoChart(page)
  await toggle(page, 'tier-migration').click()

  // What the band is short of is height, not width — it is already as wide as
  // the surface — so the escape is a window-sized dialog, not a taller band.
  await band(page, 'tier-migration')
    .getByRole('button', { name: 'Read the whole document on Tier migration' })
    .click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  // A local lane has no ticket behind it, and the dialog says so rather than
  // leaving a blank where a key would be.
  await expect(dialog).toContainText('Owned by this chart')
  // The part the cap was hiding.
  await expect(dialog).toContainText('Per-customer overrides')

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // Closing the full view leaves the band exactly as it was.
  await expect(band(page, 'tier-migration')).toBeVisible()
})

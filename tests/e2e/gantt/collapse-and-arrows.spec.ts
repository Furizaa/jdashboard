import { expect, test } from '../fixtures/test'
import {
  arrow,
  arrows,
  openDemoChart,
  row,
  rows,
  seedDemoChart,
  seedDemoIssues,
  visibleNodeIds,
} from './chart-fixture'

// Collapse, and what it does to the arrows — which is the whole reason collapse
// is interesting on this surface rather than merely tidy.
//
// An arrow whose endpoint is collapsed out of view **re-anchors** to the nearest
// visible ancestor, and arrows landing on the same pair **merge with a count**
// (ADR-0012 §10). Hiding the arrow was rejected: collapsing a lane would then
// silently destroy information, so the chart could only be trusted fully
// expanded, which defeats collapse. The fully collapsed chart is therefore a
// PRD-level dependency graph — arguably the most useful view of all — and these
// assertions are that claim, drawn.

test.beforeEach(async ({ local, world }) => {
  // Both halves of the world this surface reads: the chart on disk, and the
  // tickets its mirrored lanes stand for. The `world` fixture is also what
  // installs the MSW sidecar's state — without it `getMyself` has nothing to
  // answer and `AuthGate` covers the app before a chart is ever drawn.
  await seedDemoChart(local)
  seedDemoIssues(world)
})

test('collapsing a lane hides its descendants and re-anchors their arrows', async ({ page }) => {
  await openDemoChart(page)
  await expect(arrow(page, 'geo-142', 'invoice-rewrite')).toHaveCount(1)

  await row(page, 'pricing-api').getByRole('button', { name: 'Collapse Pricing API v2' }).click()

  // The lane stays — a collapsed lane is still a row — and its children go.
  await expect(row(page, 'pricing-api')).toHaveAttribute('data-collapsed', 'true')
  const visible = await visibleNodeIds(page)
  expect(visible).toContain('pricing-api')
  expect(visible).not.toContain('geo-141')
  expect(visible).not.toContain('geo-142')

  // The dependency GEO-142 carried is now stated by the lane you can see.
  await expect(arrow(page, 'geo-142', 'invoice-rewrite')).toHaveCount(0)
  await expect(arrow(page, 'pricing-api', 'invoice-rewrite')).toHaveCount(1)

  // `geo-141 blocks geo-142` was between two children of this lane, so it
  // re-anchors to a self-loop and is **dropped**: a self-arrow says nothing.
  await expect(arrow(page, 'pricing-api', 'pricing-api')).toHaveCount(0)

  await row(page, 'pricing-api').getByRole('button', { name: 'Expand Pricing API v2' }).click()
  await expect(arrow(page, 'geo-142', 'invoice-rewrite')).toHaveCount(1)
})

test('a fully collapsed chart is a PRD-level dependency graph, with merged arrows', async ({
  page,
}) => {
  await openDemoChart(page)
  await expect(arrows(page)).toHaveCount(6)

  // One press folds every lane that has children, which from a fully expanded
  // chart is the whole decomposition at once.
  await page.getByRole('button', { name: 'Collapse all lanes' }).click()

  expect(await visibleNodeIds(page)).toEqual([
    'tier-migration',
    'billing-cutover',
    'legacy-sunset',
    'geo-200',
  ])
  await expect(rows(page)).toHaveCount(4)

  // Three dependencies from the tier-migration subtree into the billing-cutover
  // subtree — `geo-142 → invoice-rewrite`, `pricing-ui → dunning` and
  // `pricing-api → geo-150` — become **one** arrow carrying a count of 3, not
  // three arrows drawn on top of each other.
  const merged = arrow(page, 'tier-migration', 'billing-cutover')
  await expect(merged).toHaveCount(1)
  await expect(merged).toHaveAttribute('data-count', '3')
  // The count is the information in a collapsed chart, so it names what it
  // stands for rather than only how many.
  await expect(merged).toContainText('3 dependencies')
  await expect(merged).toContainText('geo-142-blocks-invoice-rewrite')

  // The cycle survives collapse as a cycle between the two PRDs that hold it,
  // which is the altitude the reader is planning at.
  await expect(arrow(page, 'billing-cutover', 'legacy-sunset')).toHaveAttribute(
    'data-cycle',
    'true',
  )
  await expect(arrow(page, 'legacy-sunset', 'billing-cutover')).toHaveAttribute(
    'data-cycle',
    'true',
  )
  // Six edges, three arrows: one merged, two closing the loop, and the
  // same-parent edge dropped.
  await expect(arrows(page)).toHaveCount(3)

  await page.getByRole('button', { name: 'Expand all lanes' }).click()
  await expect(rows(page)).toHaveCount(15)
  await expect(arrows(page)).toHaveCount(6)
})

test("collapse is the reader's own state, kept per chart across a reload", async ({ page }) => {
  await openDemoChart(page)
  await row(page, 'pricing-ui').getByRole('button', { name: 'Collapse Pricing UI rework' }).click()
  await expect(row(page, 'pricing-ui')).toHaveAttribute('data-collapsed', 'true')

  await page.reload()
  await expect(row(page, 'pricing-ui')).toHaveAttribute('data-collapsed', 'true', {
    timeout: 15_000,
  })
  // Per-viewer `localStorage`, never a field in `chart.json` an agent could
  // fight with (ADR-0012, "Client plumbing"), so nothing on disk moved.
  await expect(row(page, 'pricing-api')).toHaveAttribute('data-collapsed', 'false')
})

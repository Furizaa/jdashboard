import { expect, test } from '../fixtures/test'
import { testIds } from '~/lib/testids'
import {
  DEMO_CHART_ID,
  arrow,
  arrows,
  bar,
  bars,
  childSpan,
  openDemoChart,
  row,
  rows,
  seedDemoChart,
  seedDemoIssues,
  visibleNodeIds,
} from './chart-fixture'

// The whole surface, drawn from a chart on disk: the rail reaches it, the list
// offers it, and opening it produces the tree, the bars, the axis and the
// arrows.
//
// This is the e2e half of what `gantt-layout.test.ts` pins as a pure function.
// The table tests say the geometry is right; these say it reaches the DOM — that
// `left: 42%` of the bar region is a bar a person can see, which is the one
// thing a pure function cannot tell you (ADR-0012 §10).

test.beforeEach(async ({ local, world }) => {
  // Both halves of the world this surface reads: the chart on disk, and the
  // tickets its mirrored lanes stand for. The `world` fixture is also what
  // installs the MSW sidecar's state — without it `getMyself` has nothing to
  // answer and `AuthGate` covers the app before a chart is ever drawn.
  await seedDemoChart(local)
  seedDemoIssues(world)
})

test('the nav rail reaches Gantt, which is not a board', async ({ page }) => {
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.syncIndicator)).toContainText(/Synced|Sync failed/u)

  await page.getByTestId(testIds.navGantt).click()
  await expect(page.getByTestId(testIds.ganttSurface)).toBeVisible()

  // Like Explain, a surface and not a board: the board-only header controls are
  // gone rather than rendered inert, and the global tools stay (ADR-0012 §2).
  await expect(page.getByTestId(testIds.onlyWorkspaceToggle)).toHaveCount(0)
  await expect(page.getByTestId(testIds.refreshButton)).toBeVisible()
  await expect(page.getByTestId(testIds.navGantt)).toHaveAttribute('data-status', 'active')
})

test('the chart list offers the chart, and opening one names it in the URL', async ({ page }) => {
  await page.goto('/gantt?e2e=1')

  const listRow = page.locator(
    `[data-testid="${testIds.ganttChartRow}"][data-chart-id="${DEMO_CHART_ID}"]`,
  )
  await expect(listRow).toBeVisible({ timeout: 15_000 })
  // The row carries what decides whether this is the chart you meant — and the
  // counts come from the store's summary, so "4 of 15 done" is the chart's own
  // arithmetic rather than the renderer's.
  await expect(listRow).toContainText('Pricing rework')
  await expect(listRow).toContainText('1 of 16 done')

  await listRow.click()
  // A chart is a thing the URL names and the back button returns to (ADR-0007).
  await expect(page).toHaveURL(new RegExp(`/gantt\\?.*chart=${DEMO_CHART_ID}`, 'u'))
  await expect(rows(page).first()).toBeVisible()

  await page.goBack()
  await expect(page.getByTestId(testIds.ganttChartList)).toBeVisible()
})

test("the tree renders every lane, at its own depth, in the chart's order", async ({ page }) => {
  await openDemoChart(page)

  // Nothing collapsed on arrival: a chart whose lanes arrive folded hides the
  // decomposition the reader came to see.
  expect(await visibleNodeIds(page)).toEqual([
    'tier-migration',
    'pricing-api',
    'geo-141',
    'geo-142',
    'pricing-ui',
    'geo-143',
    'geo-144',
    'rate-cards',
    'billing-cutover',
    'invoice-rewrite',
    'dunning',
    'geo-150',
    'geo-151',
    'legacy-sunset',
    'shutdown-reads',
    'geo-200',
  ])

  // Three depths under one PRD — the chart does not decide how deep a plan is
  // allowed to be.
  await expect(row(page, 'tier-migration')).toHaveAttribute('data-depth', '0')
  await expect(row(page, 'pricing-api')).toHaveAttribute('data-depth', '1')
  await expect(row(page, 'geo-141')).toHaveAttribute('data-depth', '2')

  // A mirrored lane shows its key, its real HDR status name and its assignee —
  // so the chart answers "who has this" without a trip to Jira.
  const mirrored = row(page, 'geo-142')
  await expect(mirrored).toContainText('GEO-142')
  await expect(mirrored).toContainText('In Code Review')
  await expect(mirrored).toContainText('AH')

  // A ticket that left its epic is marked, not removed (ADR-0012 §5).
  await expect(row(page, 'geo-150').getByLabel('Orphaned')).toBeVisible()
})

test('bars are drawn for dated lanes, segmented for parents, and absent for undated ones', async ({
  page,
}) => {
  await openDemoChart(page)

  // Fourteen bars of sixteen lanes. The two without dates have no bar at all,
  // which is an ordinary state and not a defect: import makes dates nullable.
  await expect(bars(page)).toHaveCount(14)
  await expect(bar(page, 'rate-cards')).toHaveCount(0)
  await expect(bar(page, 'geo-200')).toHaveCount(0)
  await expect(row(page, 'rate-cards')).toHaveAttribute('data-undated', 'true')
  await expect(row(page, 'rate-cards')).toContainText('no dates')

  // A lane with a start and no end is the fourteenth: it has a bar, an
  // open-ended one, and it is not undated — a known start drawn as a blank row
  // is the defect that state exists to prevent (ADR-0012 §4).
  await expect(bar(page, 'geo-151')).toHaveAttribute('data-open-ended', 'true')
  await expect(row(page, 'geo-151')).toHaveAttribute('data-undated', 'false')
  await expect(bar(page, 'geo-141')).toHaveAttribute('data-open-ended', 'false')

  // A parent states the distribution, not a rolled-up state (ADR-0012 §4).
  const prd = bar(page, 'tier-migration')
  await expect(prd).toHaveAttribute('data-segmented', 'true')
  // Five leaf descendants, counted once each: the PRD lane and the features
  // under it are one piece of work at two altitudes, so only the leaves count.
  await expect(prd).toContainText('1 of 5 done')
  // A leaf is one solid bar in its own column's tone, with no label to state.
  await expect(bar(page, 'geo-141')).toHaveAttribute('data-segmented', 'false')

  // Every bar is positioned as a fraction of the axis, which is what keeps the
  // chart free of a ResizeObserver — and what this proves reached the DOM.
  await expect(prd).toHaveAttribute('style', /left: \d/u)

  // The derived child-span underlay, and the overrun it exists to make visible:
  // `tier-migration` declares a window ending 15 Nov and `pricing-ui` runs to
  // 28 Nov, so the span overflows the lane that owns it.
  await expect(childSpan(page, 'tier-migration')).toHaveAttribute('data-overflow', 'true')
  await expect(childSpan(page, 'billing-cutover')).toHaveAttribute('data-overflow', 'false')
})

test("the axis speaks the zoom's own vocabulary, and the zoom is switchable", async ({ page }) => {
  await openDemoChart(page)

  // The chart spans just over three months, so it opens at month zoom — the
  // coarsest its extent demands — and month zoom's ticks are ISO weeks.
  const zoom = page.getByTestId(testIds.ganttZoom)
  await expect(zoom.locator('[data-zoom="month"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/^W\d{1,2}$/u).first()).toBeVisible()

  // Three fixed zooms, each with its own honest labels rather than one density
  // heuristic (ADR-0012 §10).
  await zoom.locator('[data-zoom="quarter"]').click()
  await expect(page.getByText('Oct', { exact: true })).toBeVisible()
  await expect(page.getByText('Jan', { exact: true })).toBeVisible()
  await expect(page.getByText(/^W\d{1,2}$/u)).toHaveCount(0)

  await zoom.locator('[data-zoom="week"]').click()
  await expect(page.getByText(/^Mon \d{1,2}$/u).first()).toBeVisible()
})

test('arrows are drawn between lanes at any depth, and a cycle is named', async ({ page }) => {
  await openDemoChart(page)

  // Six declared dependencies, six arrows, drawn over the bar region.
  await expect(arrows(page)).toHaveCount(6)

  // Across depths: a depth-2 ticket blocks a depth-1 feature of another PRD.
  const crossDepth = arrow(page, 'geo-142', 'invoice-rewrite')
  await expect(crossDepth).toHaveCount(1)
  await expect(crossDepth).toHaveAttribute('data-count', '1')
  await expect(crossDepth).toContainText('geo-142 blocks invoice-rewrite')

  // A cycle is recorded and then surfaced — the API never refuses to record a
  // dependency someone declared (ADR-0012 §6).
  const warning = page.getByTestId(testIds.ganttCycleWarning)
  await expect(warning).toBeVisible()
  await expect(warning).toHaveAttribute('data-count', '1')
  // Named by title, closed on the way out, so the loop reads as a loop.
  await expect(warning).toContainText(
    'Dunning reads the new schedule → Stop reading the legacy table → Dunning reads the new schedule',
  )

  // …and every lane in it is unresolvable, on the row and on its bar.
  await expect(row(page, 'dunning')).toHaveAttribute('data-blocked', 'unresolvable')
  await expect(bar(page, 'shutdown-reads')).toHaveAttribute('data-blocked', 'unresolvable')
  await expect(row(page, 'dunning').getByLabel('In a cycle')).toBeVisible()

  // A lane waiting on something unfinished is blocked, derived from the graph
  // and never stored — so it cannot go stale when the blocker ships.
  await expect(row(page, 'invoice-rewrite')).toHaveAttribute('data-blocked', 'blocked')
  await expect(row(page, 'geo-141')).toHaveAttribute('data-blocked', 'none')
})

test('a chart the URL names but disk does not is a stale bookmark, not an error', async ({
  page,
}) => {
  await page.goto('/gantt?e2e=1&chart=no-such-chart')
  await expect(page.getByText('There is no chart called')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId(testIds.ganttRow)).toHaveCount(0)
})

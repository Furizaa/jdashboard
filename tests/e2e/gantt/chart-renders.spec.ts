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

test('bars are drawn for dated lanes, segmented for parents, and ghosted for undated ones', async ({
  page,
}) => {
  await openDemoChart(page)

  // Sixteen bars of sixteen lanes. The two without dates get a **ghost** — an
  // invented week, drawn as a dashed outline with no fill, because a chart that
  // draws nothing for its `TO DO` work cannot answer what to work on next
  // (ADR-0012 §4's amendment). It stays undated: the invention is visible as one.
  await expect(bars(page)).toHaveCount(16)
  await expect(bar(page, 'rate-cards')).toHaveAttribute('data-ghost', 'true')
  await expect(bar(page, 'geo-200')).toHaveAttribute('data-ghost', 'true')
  await expect(bar(page, 'geo-141')).toHaveAttribute('data-ghost', 'false')
  await expect(row(page, 'rate-cards')).toHaveAttribute('data-undated', 'true')
  await expect(bar(page, 'rate-cards')).toHaveAttribute('title', /no dates/u)

  // A lane with a start and no end has a bar of its own kind: open-ended, not
  // ghosted, and not undated — a known start drawn as a blank row is the defect
  // that state exists to prevent (ADR-0012 §4).
  await expect(bar(page, 'geo-151')).toHaveAttribute('data-open-ended', 'true')
  await expect(row(page, 'geo-151')).toHaveAttribute('data-undated', 'false')
  await expect(bar(page, 'geo-141')).toHaveAttribute('data-open-ended', 'false')

  // A parent states the distribution, not a rolled-up state (ADR-0012 §4).
  const prd = bar(page, 'tier-migration')
  await expect(prd).toHaveAttribute('data-segmented', 'true')
  // Five leaf descendants, counted once each: the PRD lane and the features
  // under it are one piece of work at two altitudes, so only the leaves count.
  await expect(prd).toContainText('1 of 5 done')
  // A leaf is one solid bar in its own **status**'s tone, with no label to
  // state — the ticket card's own palette, so a bar and the chip on the same
  // ticket cannot disagree about what `Done` looks like.
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
  // `.first()`, because the axis now spans more than a year: the fixture's
  // undated lanes ghost at the pinned clock's today (May 2026), five months
  // before the plan starts, and the quarter axis is padded a quarter either side
  // of *that*. So `Jan` appears for 2026 and again for 2027.
  await expect(page.getByText('Oct', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Jan', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/^W\d{1,2}$/u)).toHaveCount(0)

  await zoom.locator('[data-zoom="week"]').click()
  await expect(page.getByText(/^Mon \d{1,2}$/u).first()).toBeVisible()
})

test('arrows are drawn between lanes at any depth, and a cycle is named', async ({ page }) => {
  await openDemoChart(page)

  // Six declared dependencies and **two** arrows: the chart draws none of them
  // until a lane is selected, bar the cycle, because 54 edges over 30 lanes drew
  // a thicket nobody could read one dependency out of (ADR-0012 §10's
  // amendment). The cycle is the exception — an impossible plan has to look it.
  await expect(arrows(page)).toHaveCount(2)

  // Across depths: a depth-2 ticket blocks a depth-1 feature of another PRD.
  // Selecting either end is what asks for it.
  await bar(page, 'invoice-rewrite').click()
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

// Zoom used to change only the tick labels: the axis was always exactly as wide
// as the window, so a chart holding one long lane squeezed its other thirty into
// a few pixels each and all three zooms drew the same unreadable picture. Now the
// axis has an intrinsic pixel width and the chart scrolls sideways under a sticky
// axis strip, which is what makes the three zooms worth having.
test('the time axis has its own width and scrolls, with the tree column pinned', async ({
  page,
}) => {
  await openDemoChart(page)

  const widthAt = async (zoom: 'week' | 'month' | 'quarter'): Promise<number> => {
    await page.getByTestId(testIds.ganttZoom).locator(`[data-zoom="${zoom}"]`).click()
    await expect(bar(page, 'geo-141')).toBeVisible()
    return bar(page, 'geo-141').evaluate((element) => element.getBoundingClientRect().width)
  }

  // The same ten days of work, three zooms, three widths — which is the whole
  // point: at week zoom a ticket is readable, at quarter zoom a programme is.
  const week = await widthAt('week')
  const month = await widthAt('month')
  const quarter = await widthAt('quarter')

  expect(week).toBeGreaterThan(month)
  expect(month).toBeGreaterThan(quarter)

  // At week zoom the chart is wider than its frame, so there is somewhere to
  // scroll — the fix for "the timeline should extend left and right".
  await page.getByTestId(testIds.ganttZoom).locator('[data-zoom="week"]').click()
  const scrollable = await page
    .locator('[data-testid="gantt-surface"] .overflow-auto')
    .first()
    .evaluate((element) => element.scrollWidth > element.clientWidth + 1)
  expect(scrollable).toBe(true)

  // And the lane titles stay put while it does: the tree column is `sticky`, so a
  // bar scrolled into view is still attached to a name. The row itself scrolls
  // with the content — it is the cell inside it that is pinned, which is why this
  // measures the title rather than the row.
  const title = row(page, 'geo-141').getByTestId(testIds.ganttJiraLane)
  const before = await title.boundingBox()
  await page
    .locator('[data-testid="gantt-surface"] .overflow-auto')
    .first()
    .evaluate((element) => {
      element.scrollLeft += 400
    })
  const after = await title.boundingBox()
  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThan(2)
})

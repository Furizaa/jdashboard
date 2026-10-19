import { expect, test } from '../fixtures/test'
import { testIds } from '~/lib/testids'
import { DEMO_CHART_ID, openDemoChart, row, seedDemoChart, seedDemoIssues } from './chart-fixture'
import { DEMO_CHART_BODIES, demoChart } from '~/contexts/gantt/view-model/__fixtures__/demo-chart'
import type { GanttNode } from '~/kernel'
import type { Locator, Page } from '@playwright/test'

// What the chart is waiting on somebody to fix, in **one line** (ADR-0012 §4).
//
// One line rather than three badges because one instruction to an agent fixes
// all of it — "date these, place those, and tell me what happened to GEO-150" is
// a single turn — and a count split across the chart is a count nobody adds up.
// This is also what ADR-0012 §8's "unplaced tray" became, and it is read-only
// for the same reason: the agent, which can read a ticket to decide where it
// belongs, does the placing.

const needsAttention = (page: Page): Locator => page.getByTestId(testIds.ganttNeedsAttention)

test('the four counts render as one line, each naming what it counted', async ({
  page,
  local,
  world,
}) => {
  await seedDemoChart(local)
  seedDemoIssues(world)
  await openDemoChart(page)

  const line = needsAttention(page)
  await expect(line).toBeVisible()

  // Two lanes with no dates (`rate-cards`, `geo-200`), one in flight with no
  // forecast end (`geo-151`), one nobody placed (`geo-200`, a childless jira
  // lane still at the root where import dropped it), and one orphan
  // (`geo-150`).
  await expect(line).toContainText('2 undated')
  // Counted apart from the undated ones, and spelled out: "nobody knows when
  // this starts" and "nobody has forecast when this finishes" ask for different
  // work, and reading the second as the first draws a known start as a blank row.
  await expect(line).toContainText('1 in flight, no forecast end')
  await expect(line).toContainText('1 unplaced')
  await expect(line).toContainText('1 orphaned')

  // The total is the **union**, not the sum: `geo-200` is both undated and
  // unplaced, and it is one lane to go and fix.
  await expect(line).toHaveAttribute('data-total', '4')

  // Each count names the lanes behind it, so the instruction can be written
  // without hunting for them.
  await expect(line).toHaveAttribute('title', /Undated: rate-cards, geo-200/u)
  await expect(line).toHaveAttribute('title', /In flight: geo-151/u)
  await expect(line).toHaveAttribute('title', /Unplaced: geo-200/u)
  await expect(line).toHaveAttribute('title', /Orphaned: geo-150/u)

  // And each is visible on its own lane too: the marking a departed ticket got
  // instead of being deleted, and the dimmed lane with no bar.
  await expect(row(page, 'geo-150').getByLabel('Orphaned')).toBeVisible()
  await expect(row(page, 'geo-200')).toHaveAttribute('data-undated', 'true')
})

test('a chart with nothing outstanding says nothing at all', async ({ page, local, world }) => {
  seedDemoIssues(world)
  // Everything placed, everything dated — a forecast end included, which is
  // what the in-flight lane is missing — and nothing orphaned: the line is
  // absent rather than a reassuring "0 undated · 0 unplaced · 0 orphaned".
  const settled: GanttNode[] = []
  for (const node of demoChart.nodes) {
    // `geo-200` is the unplaced one — a childless jira lane still at the root.
    if (node.id === 'geo-200') continue
    settled.push(
      Object.assign({}, node, {
        orphaned: false,
        start: node.start ?? '2026-10-05',
        // After every start in the fixture, `geo-151`'s included, so filling it
        // in cannot produce a lane that ends before it begins.
        end: node.end ?? '2026-11-30',
      }),
    )
  }
  await local.seedGanttChart({ ...demoChart, jiraSources: [], nodes: settled }, DEMO_CHART_BODIES)

  await page.goto(`/gantt?e2e=1&chart=${DEMO_CHART_ID}`)
  await expect(page.getByTestId(testIds.ganttRow).first()).toBeVisible({ timeout: 15_000 })
  await expect(needsAttention(page)).toHaveCount(0)
})

import { expect, type Locator, type Page } from '@playwright/test'
import { testIds } from '~/lib/testids'
import {
  DEMO_CHART_BODIES,
  DEMO_CHART_ID,
  demoChart,
} from '~/contexts/gantt/view-model/__fixtures__/demo-chart'
import { makeIssue } from '../fixtures/factories'
import type { LocalStore } from '../fixtures/local-store'
import type { World } from '../world/World'

// What every Gantt spec needs: the committed fixture chart on the e2e server's
// disk, and the locators for the rows, bars and arrows drawn from it.
//
// **The fixture is the one from `view-model/__fixtures__`, not a second world.**
// It was built to exercise every case the surface has to draw — three depths, an
// overrun, an undated lane, an open-ended one, a cross-depth arrow, three
// arrows that merge under collapse, one that is dropped, a cycle, an orphan, an
// unplaced ticket — so a case cannot be covered in the layout's table tests and
// missing here.
//
// Mocking happens at the HTTP boundary (ADR-0001), and a chart is the one thing
// under `~/.clashboard/` with **no** HTTP boundary behind it: the app is its
// system of record (ADR-0012 §1). The seam is therefore the same one the tags
// and notes specs use — the throwaway `HOME` from `playwright.config.ts` — and
// no spec here reads or writes the developer's real `~/.clashboard/gantt/`.

export { DEMO_CHART_ID }

/**
 * The fixture chart on disk, with **no `jiraSources`**.
 *
 * Deliberate, and the fixture's own comment says why: a chart with epics behind
 * it syncs when it is opened more than five minutes stale, and the MSW World
 * does not model `parent in (…)` — it would answer the discovery search with
 * every issue the spec seeded and the chart under test would grow nodes
 * mid-assertion. Sync has its own unit coverage against a faked gateway; what
 * these specs are for is what the surface draws from a chart that is already
 * there.
 */
export async function seedDemoChart(local: LocalStore): Promise<void> {
  await local.seedGanttChart({ ...demoChart, jiraSources: [] }, DEMO_CHART_BODIES)
}

/**
 * The Jira side of the mirrored lanes, so clicking one opens a real ticket
 * rather than a 404 panel. The World answers the board search with everything
 * seeded, so these are also the cards the palette finds.
 */
export function seedDemoIssues(world: World): void {
  world.seedIssues(MIRRORED_LANES.map(([key, summary]) => makeIssue({ key, summary })))
}

/** Every mirrored lane in the fixture, as `[key, summary]`. */
const MIRRORED_LANES: ReadonlyArray<readonly [string, string]> = [
  ['GEO-141', 'Quote endpoint returns tiers'],
  ['GEO-142', 'Tier lookup is cached per region'],
  ['GEO-143', 'Tier selector on the quote form'],
  ['GEO-144', 'Price breakdown drawer'],
  ['GEO-150', 'Legacy invoice importer'],
  ['GEO-151', 'Backfill historic invoice lines'],
  ['GEO-200', 'Audit tier rounding'],
]

/** Open the fixture chart and wait until its lanes are drawn. */
export async function openDemoChart(page: Page): Promise<void> {
  await page.goto(`/gantt?e2e=1&chart=${DEMO_CHART_ID}`)
  await expect(rows(page).first()).toBeVisible({ timeout: 15_000 })
}

export const rows = (page: Page): Locator => page.getByTestId(testIds.ganttRow)

export const row = (page: Page, nodeId: string): Locator =>
  page.locator(`[data-testid="${testIds.ganttRow}"][data-node-id="${nodeId}"]`)

export const bars = (page: Page): Locator => page.getByTestId(testIds.ganttBar)

export const bar = (page: Page, nodeId: string): Locator =>
  page.locator(`[data-testid="${testIds.ganttBar}"][data-node-id="${nodeId}"]`)

export const childSpan = (page: Page, nodeId: string): Locator =>
  page.locator(`[data-testid="${testIds.ganttChildSpan}"][data-node-id="${nodeId}"]`)

export const arrows = (page: Page): Locator => page.getByTestId(testIds.ganttArrow)

export const arrow = (page: Page, from: string, to: string): Locator =>
  page.locator(`[data-testid="${testIds.ganttArrow}"][data-from="${from}"][data-to="${to}"]`)

/** The ids of every visible lane, top to bottom — the tree as the reader sees it. */
export async function visibleNodeIds(page: Page): Promise<readonly string[]> {
  return rows(page).evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLElement).dataset.nodeId ?? ''),
  )
}

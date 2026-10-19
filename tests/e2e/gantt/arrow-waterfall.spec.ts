import { expect, test } from '../fixtures/test'
import { testIds } from '~/lib/testids'
import {
  arrow,
  arrows,
  bar,
  openDemoChart,
  row,
  seedDemoChart,
  seedDemoIssues,
} from './chart-fixture'

// Selecting a lane, and the dependency waterfall that lights up when you do.
//
// The default is **no arrows**, which is ADR-0012 §10's amendment and a reversal
// of what shipped: the first real chart carried 54 edges over 30 lanes and drew a
// thicket nobody could read one dependency out of. So the arrows wait to be asked
// for, the question is "what does this lane wait on, and what waits on it", and
// the gesture is a click on the bar — the lane's *title* still opens the ticket,
// so the two gestures stay on two targets.
//
// The assertion worth reading twice is the directedness one. A lane that merely
// shares a blocker with the chain stays dark, because on a graph of this density
// an undirected walk would light the whole chart and put the thicket straight
// back.

test.beforeEach(async ({ local, world }) => {
  await seedDemoChart(local)
  seedDemoIssues(world)
})

test('a chart opens with no arrows, and selecting a lane lights its whole waterfall', async ({
  page,
}) => {
  await openDemoChart(page)

  // Two, and both are the cycle: a plan that cannot execute has to look
  // impossible whether or not anybody asked (ADR-0012 §6).
  await expect(arrows(page)).toHaveCount(2)
  await expect(arrow(page, 'dunning', 'shutdown-reads')).toHaveAttribute('data-cycle', 'true')
  await expect(page.getByTestId(testIds.ganttSelection)).toHaveCount(0)

  // `geo-141` blocks `geo-142` blocks `invoice-rewrite`. Selecting the middle
  // lane must light both hops, not just the one it is an endpoint of.
  await bar(page, 'geo-142').click()

  await expect(bar(page, 'geo-142')).toHaveAttribute('data-selected', 'true')
  await expect(arrow(page, 'geo-141', 'geo-142')).toHaveAttribute('data-focus', 'waterfall')
  await expect(arrow(page, 'geo-142', 'invoice-rewrite')).toHaveAttribute('data-focus', 'waterfall')

  // The header says whose waterfall is on screen, and carries the way out —
  // without it a reader is looking at a mostly-faded chart with no obvious undo.
  const banner = page.getByTestId(testIds.ganttSelection)
  await expect(banner).toHaveAttribute('data-node-id', 'geo-142')
  await expect(banner).toContainText('Tier lookup is cached per region')
})

test('a lane that only shares a blocker with the chain stays dark', async ({ page }) => {
  await openDemoChart(page)

  // `pricing-api` blocks `geo-150`, and `pricing-api`'s child `geo-142` blocks
  // `invoice-rewrite`. Selecting `geo-150` reaches `pricing-api` upstream and
  // stops: `invoice-rewrite` is downstream of a *sibling*, not of `geo-150`.
  await bar(page, 'geo-150').click()

  await expect(arrow(page, 'pricing-api', 'geo-150')).toHaveAttribute('data-focus', 'waterfall')
  await expect(arrow(page, 'geo-142', 'invoice-rewrite')).toHaveCount(0)
})

test('the selection dims everything outside the waterfall, and clears from the header', async ({
  page,
}) => {
  await openDemoChart(page)
  await bar(page, 'geo-142').click()

  // Dimming rather than hiding: the lanes outside the waterfall are still the
  // reader's context, and a chart that dropped rows on selection would reflow
  // under the click that made it.
  await expect(row(page, 'geo-142')).toHaveAttribute('data-selected', 'true')
  await expect(row(page, 'rate-cards')).toHaveAttribute('data-selected', 'false')
  await expect(bar(page, 'rate-cards')).toBeVisible()

  await page.getByRole('button', { name: /Clear the selection/u }).click()

  await expect(page.getByTestId(testIds.ganttSelection)).toHaveCount(0)
  await expect(arrows(page)).toHaveCount(2)
})

test('clicking the selected lane again clears it, and a lane title still opens its ticket', async ({
  page,
}) => {
  await openDemoChart(page)

  await bar(page, 'geo-142').click()
  await expect(bar(page, 'geo-142')).toHaveAttribute('data-selected', 'true')
  await bar(page, 'geo-142').click()
  await expect(bar(page, 'geo-142')).toHaveAttribute('data-selected', 'false')

  // The bar selects; the title opens the real ticket reader over the chart. Two
  // gestures, two targets — which is what lets the bar take the new one.
  await row(page, 'geo-142').getByTestId(testIds.ganttJiraLane).click()
  await expect(page).toHaveURL(/issue=GEO-142/u)
  await expect(bar(page, 'geo-142')).toHaveAttribute('data-selected', 'false')
})

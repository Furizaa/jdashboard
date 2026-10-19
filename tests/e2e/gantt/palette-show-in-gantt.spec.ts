import { expect, test } from '../fixtures/test'
import { testIds } from '~/lib/testids'
import { makeIssue } from '../fixtures/factories'
import { openPalette } from '../command-palette/open-palette'
import { DEMO_CHART_ID, row, rows, seedDemoChart, seedDemoIssues } from './chart-fixture'
import type { Locator, Page } from '@playwright/test'

// `g` from a ticket — "where is this in the plan", which is the direction an
// architect actually needs (ADR-0012, user story 16).
//
// The hand-off is a **URL** and nothing else: the palette navigates to
// `/gantt?chart=<id>&node=<id>` and the surface unfolds the lane's ancestors and
// scrolls to it on arrival, then consumes the param with `replace`. The palette
// never imports `contexts/gantt`; `pnpm depcruise` is the proof, and this is
// what the hand-off looks like from the outside.
//
// Legality is the key index's job: `g` is offered for a ticket some chart
// actually carries, and **absent** rather than disabled for one no chart does.

const action = (page: Page, kind: string): Locator =>
  page.locator(`[data-testid="${testIds.commandPaletteAction}"][data-action-kind="${kind}"]`)

test('`g` on a mirrored ticket reveals its lane, unfolding the ancestors', async ({
  page,
  local,
  world,
}) => {
  await seedDemoChart(local)
  seedDemoIssues(world)

  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard).first()).toBeVisible({ timeout: 15_000 })

  await openPalette(page)
  await page.keyboard.type('cached per region')
  await page.keyboard.press('Enter')
  const showInGantt = action(page, 'show-in-gantt')
  await expect(showInGantt).toBeVisible()
  await expect(showInGantt).toContainText('g')
  await expect(showInGantt).toContainText('Show in Gantt')
  await page.keyboard.press('g')

  // The chart and the lane, both named in the URL on the way in.
  await expect(page).toHaveURL(new RegExp(`/gantt\\?.*chart=${DEMO_CHART_ID}`, 'u'))
  await expect(rows(page).first()).toBeVisible({ timeout: 15_000 })

  // GEO-142 sits two levels down, and both ancestors are unfolded for it — the
  // reveal walks the tree rather than requiring the reader to find the lane.
  const revealed = row(page, 'geo-142')
  await expect(revealed).toBeVisible()
  await expect(revealed).toHaveAttribute('data-revealed', 'true')
  await expect(row(page, 'tier-migration')).toHaveAttribute('data-collapsed', 'false')
  await expect(row(page, 'pricing-api')).toHaveAttribute('data-collapsed', 'false')

  // `?node=` is consumed on arrival with `replace`, so a refresh cannot
  // re-announce a lane the reader has already been shown, and the back button
  // never lands on the reveal either.
  await expect(page).not.toHaveURL(/node=/u)
})

test('`g` is absent for a ticket no chart carries', async ({ page, local, world }) => {
  await seedDemoChart(local)
  world.seedIssues([makeIssue({ key: 'HDR-901', summary: 'Nowhere in the plan' })])

  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard).first()).toBeVisible({ timeout: 15_000 })

  await openPalette(page)
  await page.keyboard.type('Nowhere in the plan')
  await page.keyboard.press('Enter')

  // Another action is offered, so the list rendered — `g` simply is not in it.
  await expect(action(page, 'open-detail')).toBeVisible()
  await expect(action(page, 'show-in-gantt')).toHaveCount(0)
})

import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'
import { cardAnimationState } from '~/lib/testids'

// Animation durations are zeroed under `?e2e=1` (see globals.css guard), but
// the *state-class application* on the ticket-card's `data-animation`
// attribute is independent of CSS timing — useChangeIndication drives it
// from setTimeout calls that page.clock can fast-forward deterministically.

test('status mutation flips data-animation to "changed" for the pulse window, then clears', async ({
  page,
  world,
}) => {
  world.seedIssues([
    makeIssue({ key: 'HDR-1001', statusName: 'Reviewed' }),
    makeIssue({ key: 'HDR-1002', statusName: 'Reviewed' }),
  ])

  await page.goto('/?e2e=1')
  const changedCard = page.locator('[data-issue-key="HDR-1002"]')
  await expect(changedCard).toBeVisible()

  // Mutate one issue's status, then advance the polling tick.
  world.seedIssues([makeIssue({ key: 'HDR-1002', statusName: 'In Code Review' })])
  await page.clock.fastForward(60_000)

  await expect(changedCard).toHaveAttribute('data-animation', cardAnimationState.changePulse)

  // Past the 600ms PULSE window the class-marker is removed.
  await page.clock.fastForward(700)
  await expect(changedCard).not.toHaveAttribute('data-animation', cardAnimationState.changePulse)
})

test('newly seeded issue gets data-animation="entering" on the next poll', async ({
  page,
  world,
}) => {
  world.seedIssues([makeIssue({ key: 'HDR-1010', statusName: 'Reviewed' })])

  await page.goto('/?e2e=1')
  await expect(page.locator('[data-issue-key="HDR-1010"]')).toBeVisible()

  world.seedIssues([makeIssue({ key: 'HDR-1011', statusName: 'Reviewed' })])
  await page.clock.fastForward(60_000)

  const enteringCard = page.locator('[data-issue-key="HDR-1011"]')
  await expect(enteringCard).toHaveAttribute('data-animation', cardAnimationState.entering)
})

test('removed issue stays rendered with data-animation="leaving" during the fade', async ({
  page,
  world,
}) => {
  world.seedIssues([
    makeIssue({ key: 'HDR-1020', statusName: 'Reviewed' }),
    makeIssue({ key: 'HDR-1021', statusName: 'Reviewed' }),
  ])

  await page.goto('/?e2e=1')
  const leavingCard = page.locator('[data-issue-key="HDR-1021"]')
  await expect(leavingCard).toBeVisible()

  world.removeIssue('HDR-1021')
  await page.clock.fastForward(60_000)

  // The card is still in the DOM, marked as leaving, until the fade timer
  // fires. We assert the marker before advancing past FADE_MS.
  await expect(leavingCard).toHaveAttribute('data-animation', cardAnimationState.leaving)
})

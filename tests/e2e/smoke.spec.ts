import { test, expect } from './fixtures/test'
import { makeIssue } from './fixtures/factories'
import { testIds } from '~/lib/testids'

test('renders board cards seeded via the World', async ({ page, world }) => {
  world.seedIssues([
    makeIssue({ key: 'HDR-101', summary: 'HDR-101: Lorem placeholder', statusName: 'Reviewed' }),
    makeIssue({
      key: 'HDR-102',
      summary: 'HDR-102: Lorem placeholder',
      statusName: 'In Implementation',
    }),
    makeIssue({
      key: 'HDR-103',
      summary: 'HDR-103: Lorem placeholder',
      statusName: 'In Code Review',
    }),
  ])

  await page.goto('/?e2e=1')

  const cards = page.getByTestId(testIds.ticketCard)
  await expect(cards).toHaveCount(3)
  await Promise.all(
    ['HDR-101', 'HDR-102', 'HDR-103'].map((key) =>
      expect(page.locator(`[data-issue-key="${key}"]`)).toBeVisible(),
    ),
  )
})

test('animation guard zeroes transitions under ?e2e=1', async ({ page, world }) => {
  world.seedIssues([
    makeIssue({ key: 'HDR-201', summary: 'HDR-201: Lorem placeholder', statusName: 'Reviewed' }),
  ])
  await page.goto('/?e2e=1')
  const card = page.getByTestId(testIds.ticketCard).first()
  await expect(card).toBeVisible()
  const transitionDuration = await card.evaluate(
    (el) => getComputedStyle(el as HTMLElement).transitionDuration,
  )
  expect(transitionDuration).toBe('0s')
})

import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'

test('POST 400 rolls back the optimistic update and surfaces the Jira error in a toast', async ({
  page,
  world,
  mocks,
}) => {
  const KEY = 'HDR-902'
  const TRANSITIONS_PATH = `/rest/api/3/issue/${KEY}/transitions`

  world.seedIssues([makeIssue({ key: KEY, statusName: 'Reviewed' })])
  world.seedTransitions(KEY, [
    { id: 't-impl', name: 'Start Implementation', toStatusName: 'In Implementation' },
  ])

  await page.goto('/?e2e=1')
  const card = page.locator(`[data-issue-key="${KEY}"]`)
  await expect(card).toBeVisible()
  await expect(card).toContainText('Ready to Pick')

  // Hold the failure response long enough for the optimistic state to be
  // observable before the rollback fires.
  mocks.failNext('POST', `*${TRANSITIONS_PATH}`, {
    status: 400,
    body: { errorMessages: ['Workflow violation'] },
    delayMs: 400,
  })

  await card
    .getByRole('button', { name: 'Change status from Reviewed' })
    .click()
  await page.getByRole('menuitem', { name: 'In Implementation' }).click()

  // Optimistic — appears while the failure response is still in flight.
  await expect(card).toContainText('In Implementation')

  // Rolled back to the original status once the 400 response lands.
  await expect(card).toContainText('Ready to Pick')

  // Toast surfaces the parsed errorMessages entry. Use Sonner's container role
  // (`<section aria-label="Notifications …">` → role="region") rather than a
  // CSS selector on internal toast markup.
  await expect(
    page
      .getByRole('region', { name: /Notifications/ })
      .getByText('Workflow violation'),
  ).toBeVisible()

  // The one-shot is consumed: a follow-up transition hits the default
  // world-backed handler and succeeds, mutating the world and leaving the
  // card on the new status.
  await card
    .getByRole('button', { name: 'Change status from Reviewed' })
    .click()
  await page.getByRole('menuitem', { name: 'In Implementation' }).click()
  await expect(card).toContainText('In Implementation')
  expect(world.searchIssues('').issues.find((i) => i.key === KEY)?.fields.status.name).toBe(
    'In Implementation',
  )
})

test('GET 500 surfaces a fetch error in the dropdown without crashing', async ({
  page,
  world,
  mocks,
}) => {
  const KEY = 'HDR-903'
  const TRANSITIONS_PATH = `/rest/api/3/issue/${KEY}/transitions`

  world.seedIssues([makeIssue({ key: KEY, statusName: 'Reviewed' })])
  world.seedTransitions(KEY, [
    { id: 't-impl', name: 'Start Implementation', toStatusName: 'In Implementation' },
  ])

  await page.goto('/?e2e=1')
  const card = page.locator(`[data-issue-key="${KEY}"]`)
  await expect(card).toBeVisible()

  mocks.failNext('GET', `*${TRANSITIONS_PATH}`, { status: 500 })

  await card
    .getByRole('button', { name: 'Change status from Reviewed' })
    .click()

  const menu = page.getByRole('menu')
  await expect(menu).toContainText("Couldn't load transitions")
})

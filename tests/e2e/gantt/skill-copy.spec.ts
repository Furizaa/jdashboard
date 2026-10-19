import { expect, test } from '../fixtures/test'
import { testIds } from '~/lib/testids'
import { seedDemoChart, seedDemoIssues } from './chart-fixture'

// The copy-SKILL control, and specifically the state it is easiest to forget.
//
// The SKILL is the document that teaches an agent to *create* a chart, and the
// control first shipped only in an open chart's header — which made it
// unreachable exactly when it is needed: you needed a chart in order to get the
// document that explains how to make one, and the empty state cheerfully said
// "an agent creates one through the Gantt API" while offering no way to brief
// one. So the chicken-and-egg is what these specs pin.

test('the empty chart list offers the SKILL, because the SKILL is how a chart gets made', async ({
  page,
  world,
}) => {
  // Deliberately **no** chart seeded — `local` wipes `~/.clashboard` around
  // every test, so this is the genuine first-run state.
  seedDemoIssues(world)
  await page.goto('/gantt?e2e=1')

  await expect(page.getByTestId(testIds.ganttChartList)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId(testIds.ganttChartList)).toContainText('No charts yet')

  // Labelled here rather than an icon: it is the only control on the screen, and
  // an icon alone would be a mystery at the one moment a reader needs it.
  const copy = page.getByTestId(testIds.ganttCopySkill)
  await expect(copy).toBeVisible()
  await expect(copy).toContainText('Copy agent SKILL')
})

test('a populated chart list offers it too, for the next chart', async ({ page, local, world }) => {
  await seedDemoChart(local)
  seedDemoIssues(world)
  await page.goto('/gantt?e2e=1')

  await expect(page.getByTestId(testIds.ganttChartRow).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId(testIds.ganttCopySkill)).toBeVisible()
})

// The server half of the same point: the document renders without a chart id,
// substituting the documented placeholder rather than refusing.
test('GET /api/gantt/skill answers without a chart id', async ({ request }) => {
  const response = await request.get('/api/gantt/skill')
  expect(response.status()).toBe(200)
  const skill = await response.text()
  expect(skill).not.toContain('{{')
  // A valid slug, so a copy pasted unedited fails with a readable
  // `404 ChartNotFound` rather than a `400` about the id's shape.
  expect(skill).toContain('your-chart-id')
})

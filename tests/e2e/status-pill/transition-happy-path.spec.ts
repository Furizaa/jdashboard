import { http, HttpResponse } from 'msw'
import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'

const KEY = 'HDR-901'
const TRANSITIONS_PATH = `/rest/api/3/issue/${KEY}/transitions`
const SEARCH_PATH = '/rest/api/3/search/jql'

test('lazy-fetches transitions, applies optimistic update, and reflects world-confirmed status after a refetch', async ({
  page,
  world,
  mocks,
}) => {
  world.seedIssues([makeIssue({ key: KEY, statusName: 'Reviewed' })])
  world.seedTransitions(KEY, [
    { id: 't-impl', name: 'Start Implementation', toStatusName: 'In Implementation' },
  ])

  await page.goto('/?e2e=1')
  const card = page.locator(`[data-issue-key="${KEY}"]`)
  await expect(card).toBeVisible()
  // "Reviewed" displays as "Ready to Pick" via displayNameForStatus.
  await expect(card).toContainText('Ready to Pick')

  // Lazy-fetch invariant: dropdown transitions are NOT loaded on initial render.
  const transitionGets = () =>
    mocks.requests().filter((r) => r.method === 'GET' && r.path === TRANSITIONS_PATH).length
  expect(transitionGets()).toBe(0)

  // Open the dropdown — this is what should trigger the GET.
  await card
    .getByRole('button', { name: 'Change status from Reviewed' })
    .click()

  await expect(page.getByRole('menu')).toBeVisible()
  await expect.poll(transitionGets).toBe(1)

  // Gate the POST so the optimistic state is observable while it's in flight.
  // Releasing the gate lets the handler call world.transitionIssue and return
  // 204; the subsequent polling refetch then reads the world-confirmed status.
  let releasePost!: () => void
  const postGate = new Promise<void>((resolve) => {
    releasePost = resolve
  })
  mocks.use(
    http.post(`*${TRANSITIONS_PATH}`, async ({ request }) => {
      const body = (await request.json()) as { transition?: { id?: string } }
      await postGate
      world.transitionIssue(KEY, body.transition?.id ?? '')
      return new HttpResponse(null, { status: 204 })
    }),
  )

  await page.getByRole('menuitem', { name: 'In Implementation' }).click()

  // POST is in flight; the cache patch is synchronous, so the card already
  // shows the new status before the server responds.
  const transitionPosts = () =>
    mocks.requests().filter((r) => r.method === 'POST' && r.path === TRANSITIONS_PATH).length
  await expect.poll(transitionPosts).toBe(1)
  await expect(card).toContainText('In Implementation')

  // Release the gate; the world is mutated as part of the handler resolving.
  releasePost()
  await expect
    .poll(() => world.searchIssues('').issues.find((i) => i.key === KEY)?.fields.status.name)
    .toBe('In Implementation')

  // Advance the polling interval so the board refetches against the now-
  // mutated world. invalidateBoard is not called on success, so the only way
  // the card text could revert would be a refetch — and the world's status is
  // the value the test is asserting.
  const searchesBefore = mocks
    .requests()
    .filter((r) => r.method === 'POST' && r.path === SEARCH_PATH).length
  await page.clock.fastForward(60_000)
  await expect
    .poll(() =>
      mocks.requests().filter((r) => r.method === 'POST' && r.path === SEARCH_PATH).length,
    )
    .toBeGreaterThan(searchesBefore)

  await expect(card).toContainText('In Implementation')
})

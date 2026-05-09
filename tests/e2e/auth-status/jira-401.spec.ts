import { test, expect } from '../fixtures/test'

const TOKEN_PAGE_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens'

test('a 401 on /myself blocks the app behind the InvalidCredentials full-screen state', async ({
  page,
  mocks,
}) => {
  // AuthGate calls `getMyself` once on boot (retry: false). A one-shot 401
  // on the boot-time myself request is enough to land on InvalidCredentials.
  mocks.failNext('GET', '*/rest/api/3/myself', { status: 401 })

  await page.goto('/?e2e=1')

  await expect(
    page.getByRole('heading', { level: 1, name: 'Invalid Jira credentials' }),
  ).toBeVisible()

  // The body links out to the Atlassian API-tokens management page; assert
  // the href, not the visible text — that's the actionable signal.
  await expect(
    page.getByRole('link', { name: /id\.atlassian\.com\/manage-profile\/security\/api-tokens/ }),
  ).toHaveAttribute('href', TOKEN_PAGE_URL)

  // The board renders its column headings as `<h2>` elements; the search
  // input renders as `role="searchbox"`. Neither should be in the DOM while
  // AuthGate holds the gate closed.
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0)
  await expect(page.getByRole('searchbox')).toHaveCount(0)
})

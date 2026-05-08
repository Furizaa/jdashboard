import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'

// The MSW sidecar in fixtures/test.ts listens on 127.0.0.1:9999, so
// `JIRA_BASE_URL` (set in playwright.config.ts) resolves to this URL. The
// view model builds the per-issue Jira link as `${baseUrl}/browse/${KEY}`.
const JIRA_BASE_URL = 'http://127.0.0.1:9999'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test('clicking the card body opens the detail panel via ?issue=<KEY>', async ({ page, world }) => {
  world.seedIssues([
    makeIssue({ key: 'HDR-801', summary: 'HDR-801: Lorem placeholder', statusName: 'Reviewed' }),
  ])

  await page.goto('/?e2e=1')
  const card = page.locator('[data-issue-key="HDR-801"]')
  await expect(card).toBeVisible()

  await card.focus()
  await card.press('Enter')

  await expect(page).toHaveURL(/[?&]issue=HDR-801/)
  await expect(page.getByRole('dialog')).toBeVisible()

  await page.getByRole('button', { name: 'Close panel' }).click()

  await expect(page).not.toHaveURL(/[?&]issue=/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('clicking the card key copies the Jira URL and shows a Copied indicator', async ({
  page,
  world,
}) => {
  world.seedIssues([
    makeIssue({ key: 'HDR-802', summary: 'HDR-802: Lorem placeholder', statusName: 'Reviewed' }),
  ])

  await page.goto('/?e2e=1')
  const keyButton = page.getByRole('button', { name: /Copy Jira URL for HDR-802/ })
  await expect(keyButton).toHaveText('HDR-802')

  await keyButton.click()

  await expect(keyButton).toHaveText('Copied')

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboardText).toBe(`${JIRA_BASE_URL}/browse/HDR-802`)

  // Card body click was not triggered — URL should not include `?issue=`.
  expect(page.url()).not.toContain('issue=')
})

test('Cmd/Ctrl-clicking the card key opens the Jira URL in a new tab', async ({
  page,
  world,
  context,
}) => {
  world.seedIssues([
    makeIssue({ key: 'HDR-803', summary: 'HDR-803: Lorem placeholder', statusName: 'Reviewed' }),
  ])

  await page.goto('/?e2e=1')
  const keyButton = page.getByRole('button', { name: /Copy Jira URL for HDR-803/ })

  const [newPage] = await Promise.all([
    context.waitForEvent('page'),
    keyButton.click({ modifiers: ['ControlOrMeta'] }),
  ])

  // The mock sidecar doesn't serve `/browse/<KEY>`, so the new tab will get
  // a 501 — we only care that the navigation target is the Jira URL.
  await expect.poll(() => newPage.url(), { timeout: 5_000 }).toBe(
    `${JIRA_BASE_URL}/browse/HDR-803`,
  )

  // The original tab must NOT have navigated to the Jira URL — that would
  // mean the modifier-click was misinterpreted as a same-tab open.
  expect(page.url()).not.toContain('/browse/HDR-803')

  await newPage.close()
})

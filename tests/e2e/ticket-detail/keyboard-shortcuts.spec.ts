import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'

const KEY = 'HDR-460'
const JIRA_BASE_URL = 'http://127.0.0.1:9999'
const JIRA_URL = `${JIRA_BASE_URL}/browse/${KEY}`

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test('O opens Jira in new tab; C copies link and shows a Copied indicator', async ({
  page,
  context,
  world,
}) => {
  world.seedIssues([makeIssue({ key: KEY, statusName: 'In Implementation' })])
  world.seedIssueDetail(KEY, {})

  await page.goto(`/?e2e=1&issue=${KEY}`)
  await expect(page.getByRole('dialog')).toBeVisible()
  // Panel reaches 'ready' once useTicket resolves; only then is jiraUrl
  // non-null and the O/C shortcuts have something to act on. The Copy button
  // (in the breadcrumb) only renders in the ready phase.
  await expect(
    page.getByRole('button', { name: `Copy Jira URL for ${KEY}`, exact: true }),
  ).toBeVisible()

  // C → clipboard receives the Jira URL and a "Link copied" toast appears.
  // Plain 'c' is also bound to the global Quick Create shortcut; pressing it
  // opens the QC modal and the panel's copy never lands. Shift+C is the
  // narrowest signal that exercises only the panel's copy handler — its
  // shouldHandleShortcut allows shift, while QC's global shortcut blocks on
  // shift. Same code path, no interaction with the unrelated QC modal.
  await page.keyboard.press('Shift+KeyC')
  await expect(page.getByText('Link copied')).toBeVisible()
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboardText).toBe(JIRA_URL)

  // O → window.open in a new tab pointed at the Jira URL.
  const newPagePromise = context.waitForEvent('page')
  await page.keyboard.press('KeyO')
  const newPage = await newPagePromise
  await expect.poll(() => newPage.url(), { timeout: 5_000 }).toBe(JIRA_URL)
  await newPage.close()
})

test('O and C have no effect when the panel is closed', async ({ page, context, world }) => {
  world.seedIssues([makeIssue({ key: KEY, statusName: 'In Implementation' })])
  world.seedIssueDetail(KEY, {})

  await page.goto('/?e2e=1')
  await expect(page.locator(`[data-issue-key="${KEY}"]`)).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Seed a sentinel so we can prove C didn't overwrite the clipboard.
  await page.evaluate(() => navigator.clipboard.writeText('SENTINEL'))

  // O on a closed panel must not open a new tab. waitForEvent throws on
  // timeout — catch and assert null.
  const newPagePromise = context
    .waitForEvent('page', { timeout: 500 })
    .catch(() => null)
  await page.keyboard.press('KeyO')
  expect(await newPagePromise).toBeNull()

  await page.keyboard.press('KeyC')
  // Clipboard untouched.
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboardText).toBe('SENTINEL')
  // No success toast emitted.
  await expect(page.getByText('Link copied')).toHaveCount(0)
})

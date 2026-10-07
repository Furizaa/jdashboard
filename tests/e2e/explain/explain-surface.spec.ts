import { existsSync } from 'node:fs'
import { expect, test } from '../fixtures/test'
import {
  makeApprovals,
  makeIssue,
  makeMr,
  makeMrReviewer,
  makePipeline,
} from '../fixtures/factories'
import { resetDrWebRepo, seedDrWebRepo } from '../fixtures/git-repo'
import { openPalette } from '../command-palette/open-palette'
import { testIds } from '~/lib/testids'
import type { World } from '../world/World'
import type { Page } from '@playwright/test'

// The Explain surface, end to end, with two boundaries stubbed:
//
//   - **GitLab and Jira** at HTTP, by MSW, per ADR-0001.
//   - **the agent** at the process, by `tests/e2e/stubs/claude-explain.mjs`,
//     which `CLASHBOARD_CLAUDE_BIN` points at. The agent is a subprocess, so
//     the process is its boundary.
//
// Git is *not* stubbed: the prepare step is real `git fetch` + `git worktree
// add --detach`, run against a real tiny repository under the suite's throwaway
// HOME. Stubbing it would mean the e2e stopped covering the one part of the
// flow that touches the developer's disk.
//
// Every test uses its **own MR iid**. The run registry is process-scoped and
// in-memory by design (ADR-0009 §4), and the server outlives the suite — so a
// shared iid would let one test's finished run answer for the next test's tab.

const ME = 'me-gitlab'

const tabs = (page: Page) => page.getByTestId(testIds.explainTab)
const activityLines = (page: Page) => page.getByTestId(testIds.explainActivityLine)
const activityLine = (page: Page, kind: string) =>
  page.locator(`[data-testid="${testIds.explainActivityLine}"][data-kind="${kind}"]`)
const blocks = (page: Page) => page.getByTestId(testIds.explainBlock)
const block = (page: Page, kind: string) =>
  page.locator(`[data-testid="${testIds.explainBlock}"][data-kind="${kind}"]`)
const railEntries = (page: Page) => page.getByTestId(testIds.explainRailEntry)
const railMove = (page: Page, id: string) =>
  page.locator(`[data-testid="${testIds.explainRailEntry}"][data-move="${id}"]`)
const railOverview = (page: Page) =>
  page.locator(`[data-testid="${testIds.explainRailEntry}"][data-kind="overview"]`)

test.afterEach(() => {
  // The repo, and any worktree a run left behind, live under the throwaway HOME
  // but outside `~/.clashboard`, so the `local` fixture does not reach them.
  resetDrWebRepo()
})

/** The board seed every test needs: a ticket, so Jira answers and cards render. */
function seedBoard(world: World, key: string): void {
  world.seedGitlabCurrentUser({ username: ME, displayName: 'Me' })
  world.seedIssues([makeIssue({ key, summary: 'Rounding is inconsistent' })])
}

/** Seed one reviewable MR plus the repo its head commit actually lives in. */
function seedReviewableMr(world: World, iid: number) {
  const key = `HDR-${iid}`
  const repo = seedDrWebRepo(iid)
  seedBoard(world, key)
  world.seedMrs([
    makeMr({
      iid,
      jiraKey: key,
      title: `${key}: move rounding out of pricing`,
      authorUsername: ME,
      sourceBranch: 'feat/rounding',
      targetBranch: 'develop',
      headSha: repo.headSha,
      description: 'Callers round now.',
    }),
  ])
  world.seedMrReviewers(iid, [makeMrReviewer({ username: 'someone', state: 'unreviewed' })])
  world.seedMrApprovals(iid, makeApprovals())
  world.seedMrPipeline(iid, makePipeline({ status: 'success' }))
  // The whole-diff expander reads the MR's real diff from GitLab on demand
  // (ADR-0010 §6), so the world has to answer `/diffs`. The third file is not
  // named by any move, which is what proves the expander narrows rather than
  // dumping the merge request.
  world.seedMrDiffs(iid, [
    {
      oldPath: 'src/pricing/quote.ts',
      newPath: 'src/pricing/quote.ts',
      diff: '@@ -41,7 +41,7 @@\n-  return round(subtotal + tax)\n+  return subtotal + tax',
    },
    {
      oldPath: 'src/checkout/total.ts',
      newPath: 'src/checkout/total.ts',
      diff: '@@ -18,6 +18,7 @@\n+  return Math.round(quoteFor(cart))',
    },
    {
      oldPath: 'src/unrelated/elsewhere.ts',
      newPath: 'src/unrelated/elsewhere.ts',
      diff: '@@ -1,1 +1,1 @@\n-nothing\n+to do with this move',
    },
  ])
  return { repo, key }
}

test('the nav rail reaches Explain, which is not a board', async ({ page, world }) => {
  seedBoard(world, 'HDR-4200')
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.syncIndicator)).toContainText(/Synced|Sync failed/u)

  // The rail navigates between surfaces now, not just boards.
  await expect(page.getByTestId(testIds.navRail)).toHaveAttribute('aria-label', 'Surfaces')
  await page.getByTestId(testIds.navExplain).click()

  await expect(page.getByTestId(testIds.explainSurface)).toBeVisible()
  await expect(page.getByTestId(testIds.explainEmpty)).toBeVisible()

  // Explain is not a board: the board-only header controls are gone rather than
  // rendered inert (ADR-0009 §1).
  await expect(page.getByTestId(testIds.onlyWorkspaceToggle)).toHaveCount(0)
  // The global tools stay.
  await expect(page.getByTestId(testIds.refreshButton)).toBeVisible()
  await expect(page.getByTestId(testIds.tagManagerButton)).toBeVisible()
})

test('Explain from the detail panel opens the surface, streams, and renders the report', async ({
  page,
  world,
}) => {
  const iid = 4211
  const { key } = seedReviewableMr(world, iid)

  await page.goto(`/?e2e=1&issue=${key}`)
  const explainButton = page.getByTestId(testIds.explainMrButton)
  await expect(explainButton).toBeVisible({ timeout: 15_000 })
  await explainButton.click()

  // The hand-off is a URL, not an import: Detail navigates and the surface
  // starts the run on arrival (ADR-0009 §3).
  await expect(page).toHaveURL(new RegExp(`/explain\\?mr=${iid}`, 'u'))
  await expect(tabs(page)).toHaveCount(1)
  await expect(tabs(page).first()).toContainText(`!${iid}`)
  await expect(tabs(page).first()).toContainText(key)

  // The run is watchable while it works — the whole reason for the SSE channel.
  await expect(activityLines(page).first()).toBeVisible({ timeout: 30_000 })
  await expect(activityLine(page, 'read')).toContainText('src/pricing/quote.ts')
  await expect(activityLine(page, 'shell')).toContainText('git log')

  // …and ends with the typed report, which lands on Overview (ADR-0010 §2).
  await expect(page.getByTestId(testIds.explainReport)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId(testIds.explainPage)).toHaveAttribute('data-kind', 'overview')
  await expect(block(page, 'verdict')).toHaveAttribute('data-verdict', 'discuss')
  await expect(block(page, 'systems')).toContainText('pricing')
  await expect(block(page, 'blast-radius')).toContainText('POST /quotes')
  await expect(block(page, 'unverified')).toContainText('Tests cannot be run')
  // The overview holds only the whole-MR cells. The finding and the diagram
  // belong to a move, so they are not on this page at all.
  await expect(blocks(page)).toHaveCount(5)
  await expect(block(page, 'finding')).toHaveCount(0)
  // The tab has settled out of its spinner.
  await expect(tabs(page).first()).toHaveAttribute('data-phase', 'report')

  // The rail still says which surface you are on. `?mr=` selects *within* a
  // surface, and TanStack's `includeSearch` defaults to true — which used to
  // un-highlight Explain the moment a review opened.
  await expect(page.getByTestId(testIds.navExplain)).toHaveAttribute('data-status', 'active')
})

test('the report survives a reload, because the tab set lives on disk', async ({ page, world }) => {
  const iid = 4212
  seedReviewableMr(world, iid)

  await page.goto(`/explain?e2e=1&mr=${iid}`)
  await expect(page.getByTestId(testIds.explainReport)).toBeVisible({ timeout: 30_000 })

  await page.reload()
  // A ten-minute run is never lost to a refresh: the tab is derived from
  // `~/.clashboard/explain/`, not from client state (ADR-0009 §2).
  await expect(page.getByTestId(testIds.explainReport)).toBeVisible({ timeout: 15_000 })
  await expect(tabs(page)).toHaveCount(1)
})

test('a diagram opens into an overlay that pans and zooms', async ({ page, world }) => {
  const iid = 4216
  seedReviewableMr(world, iid)

  // The diagram belongs to a move, so the URL opens that move's page directly.
  await page.goto(`/explain?e2e=1&mr=${iid}&move=rounding-leaves-pricing`)
  await expect(page.getByTestId(testIds.explainReport)).toBeVisible({ timeout: 30_000 })
  // Mermaid is imported per figure, so the SVG lands after the report. The page
  // carries two of them — the model and this diagram — so both locators are
  // scoped to the cell under test.
  const diagramCell = block(page, 'diagram')
  const diagram = diagramCell.getByTestId(testIds.explainDiagram)
  await expect(diagram).toHaveAttribute('data-status', 'ready', { timeout: 15_000 })

  // Inline, a diagram is a thumbnail — the report column is too narrow to read
  // a structural one in. The overlay is where it is read.
  await diagramCell.getByTestId(testIds.explainDiagramExpand).click()
  const overlay = page.getByTestId(testIds.explainDiagramOverlay)
  await expect(overlay).toBeVisible()
  await expect(overlay).toContainText('Where rounding lives now')
  await expect(overlay.locator('svg').first()).toBeVisible()

  const stage = page.getByTestId(testIds.explainDiagramStage)
  const transformOf = () =>
    stage
      .locator('> div')
      .first()
      .evaluate((node) => node.style.transform)
  expect(await transformOf()).toBe('translate(0px, 0px) scale(1)')

  await page.getByTestId(testIds.explainDiagramZoomIn).click()
  await expect(overlay).toContainText('125%')
  expect(await transformOf()).toContain('scale(1.25)')

  await page.getByTestId(testIds.explainDiagramZoomReset).click()
  expect(await transformOf()).toBe('translate(0px, 0px) scale(1)')

  // Drag to pan, with the mouse the user actually has.
  const box = await stage.boundingBox()
  if (box === null) throw new Error('the stage has no box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2 + 40)
  await page.mouse.up()
  expect(await transformOf()).toBe('translate(-60px, 40px) scale(1)')

  await page.keyboard.press('Escape')
  await expect(overlay).toHaveCount(0)
  // Closing the overlay leaves the report where it was.
  await expect(page.getByTestId(testIds.explainReport)).toBeVisible()
})

test('a model cell draws the domain, kinds and all', async ({ page, world }) => {
  const iid = 4219
  seedReviewableMr(world, iid)

  await page.goto(`/explain?e2e=1&mr=${iid}&move=rounding-leaves-pricing`)
  await expect(page.getByTestId(testIds.explainReport)).toBeVisible({ timeout: 30_000 })

  const modelCell = block(page, 'model')
  // The stub's model is full of types mermaid's ER grammar rejects on sight, so
  // a `ready` status here is the end-to-end proof that `mermaidForModel`
  // sanitised them — in a real browser, with the real renderer (ADR-0011 §2).
  await expect(modelCell.getByTestId(testIds.explainDiagram)).toHaveAttribute(
    'data-status',
    'ready',
    { timeout: 15_000 },
  )

  // The legend is what makes "which of these types are new" readable, and it is
  // what survives a diagram that cannot be drawn.
  await expect(modelCell).toContainText('Money')
  await expect(modelCell).toContainText('the value object the rule lives on')
  await expect(modelCell.locator('[data-kind="added"]')).toBeVisible()
  await expect(modelCell.locator('[data-kind="changed"]')).toBeVisible()
  await expect(modelCell.locator('[data-kind="existing"]')).toBeVisible()

  // And it opens into the same overlay a diagram does — a model with a dozen
  // entities is unreadable at report-column width.
  await modelCell.getByTestId(testIds.explainDiagramExpand).click()
  const overlay = page.getByTestId(testIds.explainDiagramOverlay)
  await expect(overlay).toContainText('What pricing returns now')
  await expect(overlay.locator('svg').first()).toBeVisible()
})

test('closing a tab prompts, then removes the tab and the worktree', async ({ page, world }) => {
  const iid = 4213
  const { repo } = seedReviewableMr(world, iid)

  await page.goto(`/explain?e2e=1&mr=${iid}`)
  await expect(page.getByTestId(testIds.explainReport)).toBeVisible({ timeout: 30_000 })
  expect(existsSync(repo.worktreePath(iid))).toBe(true)

  await page.getByTestId(testIds.explainTabClose).click()
  // A mis-clicked X must not cost another agent run (ADR-0009 §9).
  const dialog = page.getByTestId(testIds.explainCloseDialog)
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('another review run')

  await page.getByTestId(testIds.explainCloseConfirm).click()
  await expect(tabs(page)).toHaveCount(0)
  await expect(page.getByTestId(testIds.explainEmpty)).toBeVisible()

  // Reviews do not silently accumulate checkouts on disk. The removal is
  // detached, so it lands shortly after the click rather than during it.
  await expect(async () => {
    expect(existsSync(repo.worktreePath(iid))).toBe(false)
  }).toPass({ timeout: 15_000 })
})

test('the palette runs Explain on `v`, the key Review MR had', async ({ page, world }) => {
  const iid = 4214
  seedReviewableMr(world, iid)

  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard).first()).toBeVisible({ timeout: 15_000 })

  await openPalette(page)
  await page.keyboard.type('rounding')
  await page.keyboard.press('Enter')
  const action = page.locator(
    `[data-testid="${testIds.commandPaletteAction}"][data-action-kind="explain-mr"]`,
  )
  await expect(action).toBeVisible()
  await expect(action).toContainText('v')
  await page.keyboard.press('v')

  // Muscle memory carries over: the same key, a better answer (ADR-0009 §3).
  await expect(page).toHaveURL(new RegExp(`/explain\\?mr=${iid}`, 'u'))
  await expect(page.getByTestId(testIds.explainReport)).toBeVisible({ timeout: 30_000 })
})

test('a failed checkout fails the tab rather than hanging it', async ({ page, world }) => {
  const iid = 4215
  // No repo seeded, so `git fetch` has nothing to fetch the MR head from.
  seedBoard(world, `HDR-${iid}`)
  world.seedMrs([makeMr({ iid, jiraKey: `HDR-${iid}`, authorUsername: ME })])
  world.seedMrReviewers(iid, [makeMrReviewer({ username: 'someone', state: 'unreviewed' })])
  world.seedMrApprovals(iid, makeApprovals())
  world.seedMrPipeline(iid, makePipeline())

  await page.goto(`/explain?e2e=1&mr=${iid}`)
  const failed = page.getByTestId(testIds.explainFailed)
  await expect(failed).toBeVisible({ timeout: 30_000 })
  await expect(failed).toContainText('could not check out the MR')

  // A failed tab has nothing behind it, so it closes without a confirmation.
  await page.getByTestId(testIds.explainTabClose).click()
  await expect(page.getByTestId(testIds.explainCloseDialog)).toHaveCount(0)
  await expect(tabs(page)).toHaveCount(0)
})

test('the rail groups the change into moves, and one opens as a notebook', async ({
  page,
  world,
}) => {
  const iid = 4217
  seedReviewableMr(world, iid)

  await page.goto(`/explain?e2e=1&mr=${iid}`)
  await expect(page.getByTestId(testIds.explainReport)).toBeVisible({ timeout: 30_000 })

  // Overview is pinned first, then one entry per move, in the agent's order.
  await expect(railEntries(page)).toHaveCount(3)
  await expect(railOverview(page)).toHaveAttribute('data-selected', 'true')
  await expect(railOverview(page)).toContainText('2 moves')
  // The verdict rides on the Overview entry, so the conclusion stays on screen
  // from every move (ADR-0010 §2).
  await expect(railOverview(page)).toContainText('discuss')

  // The rail is rich on purpose: title, why, systems, size, and what is wrong.
  const first = railMove(page, 'rounding-leaves-pricing')
  await expect(first).toContainText('Rounding leaves the pricing service')
  await expect(first).toContainText('becomes each caller')
  await expect(first).toContainText('pricing')
  await expect(first).toContainText('checkout')
  await expect(first).toContainText('2 files')
  // The dot is the worst finding in the move, rolled up — not an agent-stated
  // severity.
  await expect(first).toHaveAttribute('data-severity', 'high')
  // …and a move with no findings gets no dot at all.
  await expect(railMove(page, 'legacy-helper-deleted')).not.toHaveAttribute('data-severity', /.+/u)

  await first.click()

  // A move is a thing the URL names and the back button can return to —
  // ADR-0007's rule, one level down.
  await expect(page).toHaveURL(new RegExp(`mr=${iid}.*move=rounding-leaves-pricing`, 'u'))
  const notebookPage = page.getByTestId(testIds.explainPage)
  await expect(notebookPage).toHaveAttribute('data-kind', 'move')
  await expect(notebookPage).toHaveAttribute('data-move', 'rounding-leaves-pricing')

  // The page says what the move is, for a reader who arrived from a link and
  // never saw the rail entry.
  const header = page.getByTestId(testIds.explainMoveHeader)
  await expect(header).toContainText('Move 1 of 2')
  await expect(header).toContainText('Rounding leaves the pricing service')
  await expect(header).toContainText('src/pricing/quote.ts')

  // …then the cells, in the order that explains it: prose, the shape it leaves,
  // the evidence, and only then what is wrong with it.
  await expect(block(page, 'narrative')).toContainText('raw cents')
  await expect(block(page, 'model')).toContainText('Money')
  await expect(block(page, 'diff')).toContainText('src/pricing/quote.ts')
  await expect(page.getByTestId(testIds.explainDiffCaption)).toContainText('simply gone')
  await expect(block(page, 'diagram')).toBeVisible()
  await expect(block(page, 'finding')).toHaveAttribute('data-severity', 'high')

  // The finding is last on the page whatever order the agent wrote it in: an
  // explanation that opens with a warning is a code review (ADR-0011 §4).
  const kinds = await blocks(page).evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLElement).dataset.kind),
  )
  expect(kinds.indexOf('finding')).toBe(kinds.length - 1)
  // No verdict on a move page: that is the merge request's, not this move's.
  await expect(block(page, 'verdict')).toHaveCount(0)

  await page.goBack()
  await expect(page.getByTestId(testIds.explainPage)).toHaveAttribute('data-kind', 'overview')
})

test('a move the report does not contain falls back to Overview', async ({ page, world }) => {
  const iid = 4218
  seedReviewableMr(world, iid)

  // A shared link can outlive the report it was written against, and a re-run
  // has no obligation to find the same moves.
  await page.goto(`/explain?e2e=1&mr=${iid}&move=long-gone`)
  await expect(page.getByTestId(testIds.explainReport)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId(testIds.explainPage)).toHaveAttribute('data-kind', 'overview')
  await expect(railOverview(page)).toHaveAttribute('data-selected', 'true')
})

test('a move page can expand the whole diff of its own files', async ({ page, world }) => {
  const iid = 4219
  seedReviewableMr(world, iid)

  await page.goto(`/explain?e2e=1&mr=${iid}&move=rounding-leaves-pricing`)
  await expect(page.getByTestId(testIds.explainMoveHeader)).toBeVisible({ timeout: 30_000 })

  // The curated diff cell is the default; the expander is how the reader checks
  // what the curation left out (ADR-0010 §6).
  const toggle = page.getByTestId(testIds.explainWholeDiffToggle)
  await expect(toggle).toContainText('Show the whole diff')
  await expect(toggle).toContainText('2 files')
  await expect(page.getByTestId(testIds.explainWholeDiff)).toHaveCount(0)

  await toggle.click()
  const whole = page.getByTestId(testIds.explainWholeDiff)
  await expect(whole).toBeVisible()

  // The move's two files, and not the third one in the merge request.
  const files = page.getByTestId(testIds.explainWholeDiffFile)
  await expect(files).toHaveCount(2)
  await expect(files.first()).toHaveAttribute('data-path', 'src/pricing/quote.ts')
  await expect(whole).toContainText('Math.round(quoteFor(cart))')
  await expect(whole).not.toContainText('to do with this move')

  // It is a live read, so it names the commit it is showing.
  await expect(whole).toContainText('the commit this report describes')

  await toggle.click()
  await expect(page.getByTestId(testIds.explainWholeDiff)).toHaveCount(0)
})

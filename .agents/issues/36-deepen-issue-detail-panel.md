# 36 — Deepen issue-detail-panel orchestration behind a `useIssuePanel` hook

**Type:** AFK

## Parent

Architecture refactor — no parent PRD. Sibling of [33-deepen-jira-module](./33-deepen-jira-module.md), [34-deepen-gitlab-module](./34-deepen-gitlab-module.md), [35-deepen-dashboard-data-layer](./35-deepen-dashboard-data-layer.md). Issues 33–35 deepened the server-side data layer and the client cache. This issue brings the same shape — concrete name, injected deps, replaceable test seam — to the **UI orchestration layer** that today is open-coded in `IssueDetailPanel.tsx`.

## Background

The current shape of the issue-detail panel:

- `src/features/ticket-detail/IssueDetailPanel.tsx` is **390 LoC, 0 tests**. The outer `IssueDetailPanel` and inner `PanelContent` (lines 1–170) own the entire orchestration layer; lines 172–389 are presentational sub-components (`PanelHeader`, `IconButton`, `ExternalLinkButton`, `OpenMrLink`, `PanelBody`, `PropertiesRail`, `Field`, `NoDescription`, `PanelSkeleton`, `PanelMessage`).
- The orchestration responsibilities mixed into one component:
  1. **URL lifecycle** — `IssueDetailPanel.tsx:21–32` calls `useNavigate` and builds two callbacks (`close = navigate({ to: '/', search: {} })`, `open = navigate({ to: '/', search: { issue: key } })`). The URL search param `?issue=KEY` is the source of truth for whether the panel is open.
  2. **Esc-to-close handler** — `IssueDetailPanel.tsx:34–44` registers a `keydown` listener on `window` that fires `close()` on `Escape` while `issueKey !== null`.
  3. **Data subscriptions** — `IssueDetailPanel.tsx:60–61` calls `useTicket(issueKey)` + `useBoardData()` directly. (`useMrFor` is also called inside `OpenMrLink` at line 226 — out of scope, see "Out of scope".)
  4. **Polling** — `IssueDetailPanel.tsx:63–65` calls `usePolling(() => issueQuery.refetch(), 60_000)`. `usePolling` already pauses on `visibilitychange`.
  5. **Sibling traversal** — `IssueDetailPanel.tsx:71–88` derives `prevKey` / `nextKey` by filtering `boardQuery.data.issues` to the same column (`columnForStatus(issue.statusName)`) and indexing by key.
  6. **Nav-shortcut handler** — `IssueDetailPanel.tsx:90–124` registers a second `keydown` listener that:
     - Short-circuits on `event.metaKey || event.ctrlKey || event.altKey` (line 92).
     - Short-circuits when the focused element is `HTMLInputElement | HTMLTextAreaElement | (HTMLElement && isContentEditable)` (lines 93–98).
     - Maps `j` / `ArrowDown` → `onOpen(nextKey)`, `k` / `ArrowUp` → `onOpen(prevKey)`, `o` → `window.open(jiraUrl, '_blank', 'noopener,noreferrer')`, `c` → `navigator.clipboard.writeText(jiraUrl)` then `toast.success('Link copied')` / `toast.error("Couldn't copy link to clipboard")`.
  7. **Render-state branches** — `IssueDetailPanel.tsx:149–165` switches on `issueQuery.isPending` / `isError` / `data.ok === false` / `data.reason === 'unauthorized'` / fallthrough.

Real bugs hide in the same seam issues 33–35 already addressed for their layers. The shortcut dispatcher today has **zero tests** because asserting "press `c` while typing in the description's contenteditable does NOT copy a link" requires mounting React, a `QueryClient`, a `RouterProvider`, plus stubbing `navigator.clipboard`, `window.open`, and `sonner`. The sibling-traversal closure has zero tests because it is anonymous inside a `useMemo`. Wires that should be observable behaviors are private to a 390-line file.

The component bypasses an abstraction layer this codebase already established: `DashboardService` post-#35 takes injected `toast`, `openInBrowser`, `navigateToIssue` deps so its orchestration is testable without `vi.mock('sonner')` or `vi.stubGlobal('navigator')`. `IssueDetailPanel.tsx` reaches around that pattern and imports `toast` from `sonner` directly (line 4), calls `navigator.clipboard.writeText` directly (line 116), calls `window.open` directly (line 112). The deepened cache port (`DashboardCache`) and the deepened service (`DashboardService`) sit *under* this component but the component does not benefit from them at the side-effect boundary.

The goal: collapse the orchestration in lines 1–170 behind one hook `useIssuePanel(issueKey)` that returns a discriminated `IssuePanelState` union with already-bound action callbacks. The React shell (`IssueDetailPanel.tsx`) becomes a phase switch with zero `useEffect` / `useCallback` / `useMemo` / `useState`, no imports from `@tanstack/react-router`, `sonner`, `~/lib/use-polling`, `~/features/board`, and no calls to `window.open` / `navigator.clipboard` / `window.addEventListener`. Two pure helpers (`findSiblings`, `shouldHandleShortcut`) get extracted with their own tests. The `useIssuePanelWithDeps` test seam — same shape as `createDashboardService`'s injected-deps style — lets the hook be tested against spy callbacks, no `vi.mock`, no `vi.stubGlobal`.

## What to build

Three layers in `src/features/ticket-detail/`:

1. **`findSiblings` pure function** — column-aware sibling traversal. Takes `(issueKey, statusName, board)` and returns `{ prevKey, nextKey }`. Imports `columnForStatus` from `~/features/board`. Zero React imports. Tested in isolation.

2. **`shouldHandleShortcut` pure function** — input-typing + modifier-key guard. Takes a `KeyboardEvent`, returns `boolean`. Reads `document.activeElement` (browser global; available under `happy-dom` in tests). Zero React imports. Tested in isolation.

3. **`useIssuePanel` hook + `useIssuePanelWithDeps` test seam** — the orchestration layer. Owns: URL writes, Esc handler, ticket polling, sibling memoization, nav-shortcut dispatch (j/k/Arrow/o/c with `shouldHandleShortcut` guard), discriminated-union state assembly. Returns `IssuePanelState` with already-bound `close()`, `open(key)`, `openInJira()`, `copyJiraLink()` callbacks. Internally consumes `useTicket` / `useBoardData` / `useNavigate` / `usePolling` / `findSiblings` / `shouldHandleShortcut`.

The shortcut keymap (j/k/Arrow/o/c), the polling cadence (60s), the column-sibling rule, and the URL contract (`?issue=KEY`) are **hardcoded** inside the hook. They are not configurable. Per CLAUDE.md ("No abstractions for single-use code"), there is one panel; speculation about future configurability is deferred.

The shell in `IssueDetailPanel.tsx` collapses lines 1–170 to a phase switch on `panel.phase`. Lines 172–389 (presentational sub-components) stay co-located in `IssueDetailPanel.tsx` and consume bound callbacks instead of binding handlers themselves.

### Concrete file changes

- **New** `src/features/ticket-detail/find-siblings.ts` — pure function. Zero React imports. ~20 LoC.

  ```ts
  import { columnForStatus } from '~/features/board'
  import type { BoardIssue } from '~/server/jira'

  export function findSiblings(
    issueKey: string,
    currentStatusName: string,
    board: ReadonlyArray<BoardIssue>,
  ): { prevKey: string | null; nextKey: string | null } {
    const column = columnForStatus(currentStatusName)
    const siblings = board.filter((i) => columnForStatus(i.statusName) === column)
    const idx = siblings.findIndex((i) => i.key === issueKey)
    if (idx === -1) return { prevKey: null, nextKey: null }
    return {
      prevKey: idx > 0 ? siblings[idx - 1]!.key : null,
      nextKey: idx < siblings.length - 1 ? siblings[idx + 1]!.key : null,
    }
  }
  ```

- **New** `src/features/ticket-detail/find-siblings.test.ts` — pure tests, no React. ~80 LoC. Coverage:
  - Empty board → `{ prevKey: null, nextKey: null }`.
  - Issue not present in board → both null.
  - Single issue in its column → both null.
  - Issue is first in column → `prevKey: null, nextKey: <second>`.
  - Issue is last in column → `prevKey: <second-to-last>, nextKey: null`.
  - Issue is middle → both populated, neighbors are *only* same-column issues (assert via a board mixing columns; e.g. an `'In Implementation'` issue between two `'Done'` issues must be skipped because its column differs).
  - Status casing inconsistency (HDR mixes ALL-CAPS and Title Case — see `memory/project_jira_status_casing.md`): two issues with `statusName: 'In STG'` and `'IN STG'` map to the same column via `columnForStatus`'s case-insensitive lookup, so they appear as siblings. (Confirms the helper inherits `columnForStatus`'s case insensitivity rather than introducing a separate compare.)

- **New** `src/features/ticket-detail/should-handle-shortcut.ts` — pure function. Zero React imports. ~12 LoC.

  ```ts
  export function shouldHandleShortcut(event: KeyboardEvent): boolean {
    if (event.metaKey || event.ctrlKey || event.altKey) return false
    const active = document.activeElement
    if (active instanceof HTMLInputElement) return false
    if (active instanceof HTMLTextAreaElement) return false
    if (active instanceof HTMLElement && active.isContentEditable) return false
    return true
  }
  ```

- **New** `src/features/ticket-detail/should-handle-shortcut.test.ts` — uses happy-dom for `document.activeElement` setup. ~50 LoC. Coverage:
  - No focused element, no modifiers → `true`.
  - `metaKey: true` → `false`.
  - `ctrlKey: true` → `false`.
  - `altKey: true` → `false`.
  - Focused `<input>` → `false`.
  - Focused `<textarea>` → `false`.
  - Focused `contenteditable` div → `false`.
  - Focused `<button>` (not an input) → `true` — confirms we don't suppress on every `HTMLElement`.

- **New** `src/features/ticket-detail/use-issue-panel.ts` — the hook. ~150 LoC including types.

  ```ts
  import { useEffect, useMemo } from 'react'
  import { useNavigate } from '@tanstack/react-router'
  import { toast } from 'sonner'
  import { useBoardData, useTicket } from '~/dashboard'
  import { usePolling } from '~/lib/use-polling'
  import type { DetailIssue } from '~/server/jira'
  import { findSiblings } from './find-siblings'
  import { shouldHandleShortcut } from './should-handle-shortcut'

  const POLL_INTERVAL_MS = 60_000
  const PROJECT_KEY_RE = /^([A-Z][A-Z0-9]+)-\d+$/

  export type IssuePanelDeps = {
    /** key === null closes the panel; otherwise opens the given key. */
    navigateToIssue: (key: string | null) => void
    openInBrowser: (url: string) => void
    copyToClipboard: (text: string) => Promise<void>
    toast: { success: (msg: string) => void; error: (msg: string) => void }
  }

  type OpenFields = {
    issueKey: string
    close: () => void
    open: (key: string) => void
  }

  export type IssuePanelState =
    | { phase: 'closed' }
    | (OpenFields & { phase: 'loading' })
    | (OpenFields & { phase: 'error'; message: string })
    | (OpenFields & {
        phase: 'ready'
        issue: DetailIssue
        jiraUrl: string | null
        projectKey: string | null
        prevKey: string | null
        nextKey: string | null
        /** No-op when jiraUrl is null. */
        openInJira: () => void
        /** No-op when jiraUrl is null. Toasts on resolve/reject. */
        copyJiraLink: () => void
      })

  export function useIssuePanel(issueKey: string | null): IssuePanelState {
    const navigate = useNavigate()
    const deps = useMemo<IssuePanelDeps>(
      () => ({
        navigateToIssue: (key) =>
          navigate({ to: '/', search: key === null ? {} : { issue: key } }),
        openInBrowser: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
        copyToClipboard: (text) => navigator.clipboard.writeText(text),
        toast: { success: toast.success, error: toast.error },
      }),
      [navigate],
    )
    return useIssuePanelWithDeps(issueKey, deps)
  }

  export function useIssuePanelWithDeps(
    issueKey: string | null,
    deps: IssuePanelDeps,
  ): IssuePanelState {
    const issueQuery = useTicket(issueKey)
    const boardQuery = useBoardData()

    usePolling(() => {
      if (issueKey !== null) issueQuery.refetch()
    }, POLL_INTERVAL_MS)

    // Esc handler — only when open. Listens on bubble phase so ParentSelect's
    // capture-phase Esc (~/features/quick-create/ParentSelect.tsx) still wins
    // inside the quick-create modal.
    useEffect(() => {
      if (issueKey === null) return
      const onKey = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        deps.navigateToIssue(null)
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [issueKey, deps])

    const issue = issueQuery.data?.ok === true ? issueQuery.data.issue : null
    const baseUrl = issueQuery.data?.ok === true ? issueQuery.data.baseUrl : null
    const jiraUrl =
      baseUrl !== null && issueKey !== null ? `${baseUrl}/browse/${issueKey}` : null

    const projectKey = useMemo(() => {
      if (issueKey === null) return null
      const m = PROJECT_KEY_RE.exec(issueKey)
      return m !== null ? (m[1] ?? null) : null
    }, [issueKey])

    const board = boardQuery.data?.ok === true ? boardQuery.data.issues : []
    const { prevKey, nextKey } = useMemo(() => {
      if (issue === null || issueKey === null) return { prevKey: null, nextKey: null }
      return findSiblings(issueKey, issue.statusName, board)
    }, [issue, issueKey, board])

    // Nav shortcuts — j/k/Arrow/o/c, only while open.
    useEffect(() => {
      if (issueKey === null) return
      const onKey = (event: KeyboardEvent) => {
        if (!shouldHandleShortcut(event)) return
        const key = event.key.toLowerCase()
        if (key === 'j' || event.key === 'ArrowDown') {
          if (nextKey === null) return
          event.preventDefault()
          deps.navigateToIssue(nextKey)
        } else if (key === 'k' || event.key === 'ArrowUp') {
          if (prevKey === null) return
          event.preventDefault()
          deps.navigateToIssue(prevKey)
        } else if (key === 'o') {
          if (jiraUrl === null) return
          event.preventDefault()
          deps.openInBrowser(jiraUrl)
        } else if (key === 'c') {
          if (jiraUrl === null) return
          event.preventDefault()
          deps.copyToClipboard(jiraUrl).then(
            () => deps.toast.success('Link copied'),
            () => deps.toast.error("Couldn't copy link to clipboard"),
          )
        }
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [issueKey, prevKey, nextKey, jiraUrl, deps])

    if (issueKey === null) return { phase: 'closed' }

    const openFields: OpenFields = {
      issueKey,
      close: () => deps.navigateToIssue(null),
      open: (key) => deps.navigateToIssue(key),
    }

    if (issueQuery.isPending) return { ...openFields, phase: 'loading' }
    if (issueQuery.isError) {
      const message =
        issueQuery.error instanceof Error ? issueQuery.error.message : 'unknown error'
      return { ...openFields, phase: 'error', message: `Couldn't load issue: ${message}` }
    }
    if (issueQuery.data.ok === false) {
      const message =
        issueQuery.data.reason === 'unauthorized'
          ? 'Invalid Jira credentials.'
          : 'Issue not found.'
      return { ...openFields, phase: 'error', message }
    }

    return {
      ...openFields,
      phase: 'ready',
      issue: issueQuery.data.issue,
      jiraUrl,
      projectKey,
      prevKey,
      nextKey,
      openInJira: () => {
        if (jiraUrl === null) return
        deps.openInBrowser(jiraUrl)
      },
      copyJiraLink: () => {
        if (jiraUrl === null) return
        deps.copyToClipboard(jiraUrl).then(
          () => deps.toast.success('Link copied'),
          () => deps.toast.error("Couldn't copy link to clipboard"),
        )
      },
    }
  }
  ```

  Public exports from `src/features/ticket-detail/index.ts`: **only** `IssueDetailPanel`. The hook, helpers, and types are not exported across feature boundaries — there is one consumer (`IssueDetailPanel.tsx`) and the test file. Other features have no reason to reach in.

- **New** `src/features/ticket-detail/use-issue-panel.test.tsx` — hook tests. Uses `renderHook` from `@testing-library/react` (already a project dependency, used by `src/lib/use-polling.test.ts` and `src/features/board/use-change-indication.test.ts`). Calls `useIssuePanelWithDeps(issueKey, fakeDeps)` directly — bypasses `useNavigate`, so no `RouterProvider` is needed. Mounts inside a `QueryClientProvider` with seeded queries so `useTicket` / `useBoardData` resolve synchronously.

  No `vi.mock('sonner')`, no `vi.stubGlobal('navigator')`, no `vi.stubGlobal('window')`. Toast / clipboard / openInBrowser / navigateToIssue are spy functions in `fakeDeps`. ~250 LoC. Coverage at minimum:

  - `phase: 'closed'` when `issueKey === null`.
  - `phase: 'loading'` when ticket query is pending.
  - `phase: 'error', message: "Couldn't load issue: <error>"` when ticket query throws.
  - `phase: 'error', message: 'Invalid Jira credentials.'` when `data.ok === false && reason === 'unauthorized'`.
  - `phase: 'error', message: 'Issue not found.'` when `data.ok === false && reason === 'not-found'`.
  - `phase: 'ready'` produces `issue`, `jiraUrl = '<baseUrl>/browse/<key>'`, `projectKey` extracted via regex (e.g. `HDR-1234` → `'HDR'`).
  - `phase: 'ready'` `prevKey` / `nextKey` derived from seeded board cache via `findSiblings` (one assertion is enough since `find-siblings.test.ts` covers the matrix).
  - `close()` calls `deps.navigateToIssue(null)`.
  - `open('NEW-1')` calls `deps.navigateToIssue('NEW-1')`.
  - `openInJira()` calls `deps.openInBrowser(jiraUrl)`; is a no-op when ticket query has no `baseUrl`.
  - `copyJiraLink()` calls `deps.copyToClipboard(jiraUrl)` then `deps.toast.success('Link copied')` on resolved promise.
  - `copyJiraLink()` calls `deps.toast.error("Couldn't copy link to clipboard")` on rejected promise.
  - **Esc dispatched while open** → `deps.navigateToIssue(null)`. Dispatched via `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`.
  - **Esc dispatched while closed** (issueKey passed as `null`) → `deps.navigateToIssue` NOT called. Confirms the `if (issueKey === null) return` guard in the effect.
  - `j` / `ArrowDown` → `deps.navigateToIssue(nextKey)`. `j` with `nextKey === null` → no call.
  - `k` / `ArrowUp` → `deps.navigateToIssue(prevKey)`. `k` with `prevKey === null` → no call.
  - `o` → `deps.openInBrowser(jiraUrl)`. `o` with `jiraUrl === null` → no call.
  - `c` → `deps.copyToClipboard(jiraUrl)` then `deps.toast.success(...)` on resolve.
  - `c` with `metaKey: true` (Cmd+C) → no shortcut fired (covers integration with `shouldHandleShortcut`; full guard matrix tested in `should-handle-shortcut.test.ts`).
  - `c` with focused `<input>` → no shortcut fired.
  - Polling: with `vi.useFakeTimers()`, advancing 60s triggers `issueQuery.refetch()` (assertable via the seeded query's fetch counter). Uses the same fake-timer pattern as `use-polling.test.ts:21–28`.

- **Rewrite** `src/features/ticket-detail/IssueDetailPanel.tsx` — the orchestration layer (lines 1–170) collapses to a phase switch. The presentational sub-components (lines 172–389) stay co-located but consume bound callbacks. Net file size ~190 LoC (down from 390).

  Top of the file post-refactor:

  ```tsx
  import { ChevronDown, ChevronUp, ExternalLink, X } from 'lucide-react'
  import { StatusPillSelect } from '~/features/status-pill'
  import { FixasapRibbon, TypeIcon, colorForLabel, hasFixasapLabel } from '~/features/ticket-card'
  import { MrPanelBlock, useMrFor } from '~/features/mr-status'
  // useMrFor is imported from ~/dashboard today — kept as-is for OpenMrLink
  // (out of scope; see "Out of scope")
  import { useMrFor as useMrForFromDashboard } from '~/dashboard'
  import type { DetailIssue } from '~/server/jira'
  import { RenderAdf } from './adf'
  import { Activity } from './Activity'
  import { Relationships } from './Relationships'
  import { extractPlainText } from './extract-plain-text'
  import { useIssuePanel, type IssuePanelState } from './use-issue-panel'

  export function IssueDetailPanel({ issueKey }: { issueKey: string | null }) {
    const panel = useIssuePanel(issueKey)
    if (panel.phase === 'closed') return null
    return <Panel panel={panel} />
  }

  function Panel({ panel }: { panel: Exclude<IssuePanelState, { phase: 'closed' }> }) {
    const issue = panel.phase === 'ready' ? panel.issue : null
    return (
      <div
        className="fixed inset-0 z-50 flex justify-end"
        onClick={panel.close}
        role="dialog"
        aria-modal="true"
        aria-label={issue !== null ? `${panel.issueKey} — ${issue.summary}` : panel.issueKey}
      >
        <div className="bg-background/40 absolute inset-0 backdrop-blur-[1px]" aria-hidden />
        <div
          className="border-border bg-card relative my-4 mr-4 flex h-[calc(100dvh-2rem)] w-[760px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {issue !== null && hasFixasapLabel(issue.labels) && <FixasapRibbon size="panel" />}
          <PanelHeader panel={panel} />
          <div className="flex-1 overflow-y-auto">
            {panel.phase === 'loading' ? (
              <PanelSkeleton />
            ) : panel.phase === 'error' ? (
              <PanelMessage>{panel.message}</PanelMessage>
            ) : (
              <PanelBody issue={panel.issue} jiraUrl={panel.jiraUrl} onOpen={panel.open} />
            )}
          </div>
        </div>
      </div>
    )
  }

  // PanelHeader, IconButton, ExternalLinkButton, OpenMrLink, PanelBody,
  // PropertiesRail, Field, NoDescription, PanelSkeleton, PanelMessage —
  // unchanged in shape; PanelHeader now takes `panel` and binds buttons to
  // panel.close, panel.openInJira (when ready), panel.prev/nextKey via
  // panel.open. The `jiraUrl` plumbing through PanelBody is preserved.
  ```

  **Imports removed** from `IssueDetailPanel.tsx`: `useCallback`, `useEffect`, `useMemo` from `react`; `useNavigate` from `@tanstack/react-router`; `toast` from `sonner`; `useBoardData`, `useTicket` from `~/dashboard`; `columnForStatus` from `~/features/board`; `usePolling` from `~/lib/use-polling`; the `PROJECT_KEY_RE` constant. `useMrFor` from `~/dashboard` stays for `OpenMrLink`.

  **Behavior preserved exactly**: the sibling math (column-aware), the shortcut keymap, the toast strings (`'Link copied'`, `"Couldn't copy link to clipboard"`), the polling cadence (60_000 ms), the URL contract (`?issue=KEY`), the rendering branches, the `aria-modal` / `role="dialog"` markup, the backdrop click-to-close, the propagation-stop on the inner card.

### Wiring at the composition root

No composition-root changes. `useIssuePanel` consumes existing hooks (`useTicket`, `useBoardData`, `useNavigate`, `usePolling`) and the existing `sonner` global. The `useIssuePanelWithDeps` test seam mirrors the `createDashboardService(deps)` injection style established in #35 — no provider, no context, just a hook that takes its deps as an argument when tests need to substitute them.

### Tests — replace, don't layer

- **New** `src/features/ticket-detail/find-siblings.test.ts` (per coverage above).
- **New** `src/features/ticket-detail/should-handle-shortcut.test.ts` (per coverage above).
- **New** `src/features/ticket-detail/use-issue-panel.test.tsx` (per coverage above).
- **Keep** `src/features/ticket-detail/extract-plain-text.test.ts` — pure helper, unaffected.
- **Keep** `src/features/ticket-detail/adf/RenderAdf.test.tsx` — ADF rendering, unaffected.

No tests are deleted (none exist for the orchestration today). The "after a sibling-traversal `j`, the URL changes to the next column-mate" path moves from "untestable" to covered by `use-issue-panel.test.tsx`.

### Caller migration — net effect per file

| File | Before (LoC) | After (LoC) | Net change |
|---|---|---|---|
| `src/features/ticket-detail/IssueDetailPanel.tsx` | 390 | ~190 | −200 |
| `src/features/ticket-detail/use-issue-panel.ts` | 0 (new) | ~150 | +150 |
| `src/features/ticket-detail/find-siblings.ts` | 0 (new) | ~20 | +20 |
| `src/features/ticket-detail/should-handle-shortcut.ts` | 0 (new) | ~12 | +12 |
| `src/features/ticket-detail/use-issue-panel.test.tsx` | 0 (new) | ~250 | +250 |
| `src/features/ticket-detail/find-siblings.test.ts` | 0 (new) | ~80 | +80 |
| `src/features/ticket-detail/should-handle-shortcut.test.ts` | 0 (new) | ~50 | +50 |
| `src/features/ticket-detail/index.ts` | unchanged | unchanged | 0 |
| `src/features/ticket-detail/Activity.tsx` | unchanged | unchanged | 0 |
| `src/features/ticket-detail/Relationships.tsx` | unchanged | unchanged | 0 |
| `src/features/ticket-detail/extract-plain-text.ts` | unchanged | unchanged | 0 |
| `src/features/ticket-detail/adf/*` | unchanged | unchanged | 0 |
| `src/routes/index.tsx` (panel mount) | unchanged | unchanged | 0 |

**Net effect: ~200 LoC of orchestration converted into one testable hook plus two pure helpers, and ~380 LoC of new tests covering behavior that today has zero coverage.**

## Acceptance criteria

- [ ] `src/features/ticket-detail/use-issue-panel.ts`, `find-siblings.ts`, `should-handle-shortcut.ts` exist with the shapes above.
- [ ] `src/features/ticket-detail/find-siblings.ts` and `should-handle-shortcut.ts` have **zero React imports**. Greppable: `^import .* from .react.` in those two files returns no matches.
- [ ] `src/features/ticket-detail/IssueDetailPanel.tsx` does not import `useNavigate` (`@tanstack/react-router`), `toast` (`sonner`), `useBoardData` / `useTicket` (`~/dashboard`), `columnForStatus` (`~/features/board`), or `usePolling` (`~/lib/use-polling`). Greppable.
- [ ] `src/features/ticket-detail/IssueDetailPanel.tsx` does not call `useEffect`, `useCallback`, `useMemo`, `useState`, `window.open`, `navigator.clipboard`, or `window.addEventListener`. Greppable.
- [ ] `src/features/ticket-detail/use-issue-panel.test.tsx` does **not** call `vi.mock`, `vi.stubGlobal`, and does not import `sonner`, `@tanstack/react-router`, or any `getXxx` server function. The `useIssuePanelWithDeps` test seam is the entry point.
- [ ] All shortcut keys (`j`, `k`, `ArrowDown`, `ArrowUp`, `o`, `c`, `Escape`) are exercised by at least one test in `use-issue-panel.test.tsx`. Each shortcut has a no-op test (`nextKey === null`, `prevKey === null`, `jiraUrl === null`, modifier held, input focused) where applicable.
- [ ] The polling integration test in `use-issue-panel.test.tsx` uses `vi.useFakeTimers()` and asserts `issueQuery.refetch` fires after 60_000 ms — no real timer.
- [ ] All existing tests pass with no behavioral change. Manual smoke: open a ticket, press `j`/`k`/Arrow/o/c/Esc, click prev/next/X buttons, click backdrop — all work as before.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

None. Independent of #33–#35; lands cleanly on top of the deepened `DashboardCache` + `DashboardService` (uses `useTicket` / `useBoardData` from `~/dashboard`).

## Out of scope

- **`OpenMrLink` and `MrPanelBlock`'s `useMrFor` calls.** The panel's "Open MR" header button (`IssueDetailPanel.tsx:225–230`) and the properties-rail MR block call `useMrFor(issueKey)` directly. These are read-side dashboard hooks; they're not panel orchestration. Folding them in inflates the hook for no testability gain. Track separately if a "useIssuePanelMr" wrapper proves valuable later.
- **Splitting `IssueDetailPanel.tsx` into multiple files.** The presentational sub-components (`PanelHeader`, `PanelBody`, `PropertiesRail`, `IconButton`, `ExternalLinkButton`, `Field`, `NoDescription`, `PanelSkeleton`, `PanelMessage`) stay co-located with the shell. They are render-only and their co-location aids navigation. File-splitting is stylistic noise per CLAUDE.md ("Don't 'improve' adjacent code").
- **Auth gate deepening (architecture exploration candidate #2).** `AuthGate.tsx` has its own `useQuery` coupling; separate refactor.
- **Quick-create deepening (candidate #3).** `quick-create/` has zero tests; separate refactor.
- **Wrapping `dashboard/hooks.ts` behind a `BoardView` port (candidate #4).** Would let components depend on a port instead of TanStack hooks; separate refactor.
- **Cross-cutting `Clock` port (candidate #5).** `Header.tsx`'s `setInterval` + `formatDistanceToNow` is independent.
- **Cross-cutting `Notifier` / `UiServices` port (candidate #6).** `useIssuePanel` injects `toast` / `clipboard` / `openInBrowser` *for itself* via its own `IssuePanelDeps`. A codebase-wide consolidation of toast vocabulary is separate.
- **Rebindable shortcuts.** Keymap is hardcoded.
- **Configurable polling cadence.** `60_000` is hardcoded.
- **A second panel type (e.g. MR detail).** No second panel exists today; speculative generalization is deferred.
- **`Activity.tsx`, `Relationships.tsx`, `adf/*`.** Unchanged.
- **Removing the `useMrStatuses()` side-effect call in `Board.tsx`.** Out of scope per #35; still out of scope here.

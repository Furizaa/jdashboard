# 37 — Deepen Board orchestration and Quick-Create flow behind `useBoardView` + `useQuickCreate` hooks

**Type:** AFK

## Parent

Architecture refactor — no parent PRD. Sibling of [33-deepen-jira-module](./33-deepen-jira-module.md), [34-deepen-gitlab-module](./34-deepen-gitlab-module.md), [35-deepen-dashboard-data-layer](./35-deepen-dashboard-data-layer.md), [36-deepen-issue-detail-panel](./36-deepen-issue-detail-panel.md). Issues 33–35 deepened the data layer and cache; #36 brought the same concrete-name + injected-deps + replaceable-test-seam shape to the issue-detail panel. This issue applies the same shape to the **two remaining UI orchestration layers** that today are open-coded inside `Board.tsx` and the quick-create component cluster.

## Background

Two orchestration seams remain shallow and untested.

### Cluster A — `Board.tsx` (253 LoC, integration-untested)

`src/features/board/Board.tsx` lines 18–60 own the integration:

1. **Data subscription** — line 19 calls `useBoardData()`.
2. **Polling** — lines 20–22 call `usePolling(() => query.refetch(), 60_000)`.
3. **GitLab side-effect** — line 23 calls `useMrStatuses()` purely for its caching side-effect (it polls separately and surfaces the GitLab unauthorized toast at `dashboard/hooks.ts:63–70`).
4. **Change indication** — line 26 calls `useChangeIndication(liveIssues)` which returns `{ enteringKeys, changedKeys, leaving }`.
5. **Column assembly `useMemo`** — lines 28–60: for each issue, runs `filterIssues`, decides animation `state` (`entering` / `changed` / `idle`), buckets by `columnForStatus`, layers in leaving issues from `leaving.values()`, then per-column runs `sortColumnIssues` while preserving the animation `state` per key via a `stateByKey: Map` round-trip (lines 49–57).
6. **Phase-branch render** — lines 62–84 switch on pending / hard-error / unauthorized / empty / ready+stale-error.

Each pure helper has its own test (`filter-issues.test.ts`, `sort-column.test.ts`, `status-mapping.test.ts`, `use-change-indication.test.ts`, `deemphasize.test.ts`). The **integration** — filter ⨯ change-indication ⨯ leaving overlay ⨯ per-column sort with animation-key preservation — has zero tests. The animation-key round-trip (line 49: `new Map(items.map(item => [item.issue.key, item.state]))`) is the subtle bit: a `Done`-column reorder by status tier must not flip a `'changed'` pulse onto the wrong card. Today there is no test that catches a regression here.

### Cluster B — Quick-create flow (5 files, 0 tests)

`src/features/quick-create/` has zero tests. The orchestration is fragmented across:

- `QuickCreateButton.tsx` — owns `useState<boolean>` for `open`, the global `c` keyboard shortcut effect (lines 10–29 with modifier guard + input/textarea/contenteditable typing guard via `event.target`), and renders `<QuickCreateModal>`.
- `QuickCreateModal.tsx` — owns Radix `<Dialog.Root>` markup, a `summaryRef` for autofocus, a `formResetRef: useRef<(() => void) | null>` (line 15) that the form populates each render, and calls `useCreateAction({ closeModal, resetForm })` which gets fed `() => setOpen(false)` and `() => formResetRef.current?.()`.
- `QuickCreateForm.tsx` — owns TanStack Form, mutates the external `resetRef.current` on every render (line 48: `resetRef.current = () => form.reset()`), takes `mutation`, `closeModal`, `open`, `summaryRef`, `resetRef` as props.

The `formResetRef` is a ref-bridge: Modal allocates the ref → passes it to Form → Form mutates `.current` on every render → Modal-via-`useCreateAction`'s `onSuccess` invokes `.current()`. There is no normal data path between Form and Modal for "reset on success" — only this ref ping-pong. Real bugs hide here: if Form unmounts before the success branch fires, `.current` is stale and the next open shows old field values.

The component bypasses an abstraction layer this codebase already established: `createDashboardService(deps)` (#35) takes injected `toast`, `openInBrowser`, `navigateToIssue` so its orchestration is testable without `vi.mock('sonner')`. `useCreateAction` (`hooks.ts:119`) is a thin TanStack-mutation wrapper over `service.createIssue` which already owns the timeout / toast / cache-invalidate path (`service.ts:121–159`, tested in `service.test.ts`). The UI layer does not exploit this seam — it imports `useCreateAction` directly from `~/dashboard` and threads its `mutate`, `mutateAsync`, `isPending` down through Form props. There is no place to write a test for "modal closes when create succeeds" that does not also mount a `QueryClientProvider`, mock `sonner`, and stub a server function.

### The goal

Apply the #36 shape to both seams:

1. **`useBoardView(searchQuery)`** + **`useBoardViewWithDeps(searchQuery, deps)`** test seam. The shell `Board.tsx` becomes a phase switch with `<BoardColumn>` map and zero `useMemo` / `useEffect` / `usePolling` / `useMrStatuses` / `useBoardData` / `useChangeIndication` calls.
2. **`useQuickCreate()`** + **`useQuickCreateWithDeps(deps)`** test seam. The `formResetRef` ref-bridge dies. The `c` global shortcut moves out of `QuickCreateButton.tsx` and into the hook. `QuickCreateButton.tsx` becomes pure markup. `QuickCreateModal.tsx` consumes a single `qc: QuickCreateState` prop. `QuickCreateForm.tsx` registers its `form.reset()` via a callback verb (`registerReset(reset)`) instead of mutating an external ref.

Both hooks are internal to their feature folder. Public exports from `src/features/board/index.ts` and `src/features/quick-create/index.ts` stay as today — only the user-facing components (`Board`, `QuickCreateButton`).

## What to build

### Cluster A — Board

In `src/features/board/`:

1. **`assemble-columns.ts` pure function** — extract the body of the `useMemo` at `Board.tsx:28–60`. Takes `{ liveIssues, leaving, enteringKeys, changedKeys, searchQuery }`. Returns `Record<Column, ColumnItem[]>`. Imports `filterIssues`, `sortColumnIssues`, `columnForStatus`, `COLUMNS`. Zero React imports. Hosts the animation-key preservation round-trip (the `stateByKey` Map). Tested in isolation against the integration matrix that today is untested.

2. **`use-board-view.ts`** — production hook + test seam. Owns `useBoardData`, `usePolling(refetch, 60_000)`, `useMrStatuses()` (side-effect call), `useChangeIndication`, `assembleColumns`, and the discriminated phase return.

3. **Rewrite `Board.tsx`** — orchestration block (lines 18–60) collapses to a phase switch. Lines 62–253 (`BoardColumn`, `BoardMessage`, `BoardSkeleton`, `SkeletonCard`, `EmptyBoardMessage`, `ErrorBanner`) stay co-located untouched. Net `Board.tsx` size ~110 LoC.

#### Concrete file changes — Cluster A

- **New** `src/features/board/assemble-columns.ts` — ~35 LoC. Zero React imports.

  ```ts
  import type { BoardIssue } from '~/server/jira'
  import type { TicketCardAnimationState } from '~/features/ticket-card'
  import { COLUMNS, columnForStatus, type Column } from './status-mapping'
  import { filterIssues } from './filter-issues'
  import { sortColumnIssues } from './sort-column'
  import type { LeavingIssue } from './use-change-indication'

  export type ColumnItem = {
    issue: BoardIssue | LeavingIssue
    state: TicketCardAnimationState
  }

  export function assembleColumns(input: {
    liveIssues: readonly BoardIssue[]
    leaving: ReadonlyMap<string, LeavingIssue>
    enteringKeys: ReadonlySet<string>
    changedKeys: ReadonlySet<string>
    searchQuery: string
  }): Record<Column, ColumnItem[]> {
    const { liveIssues, leaving, enteringKeys, changedKeys, searchQuery } = input
    const empty: Record<Column, ColumnItem[]> = {
      'TO DO': [],
      'In Implementation': [],
      'In Code Review': [],
      Done: [],
    }
    for (const issue of filterIssues(liveIssues, searchQuery)) {
      const state: TicketCardAnimationState = enteringKeys.has(issue.key)
        ? 'entering'
        : changedKeys.has(issue.key)
          ? 'changed'
          : 'idle'
      empty[columnForStatus(issue.statusName)].push({ issue, state })
    }
    for (const leavingIssue of filterIssues([...leaving.values()], searchQuery)) {
      empty[leavingIssue.column].push({ issue: leavingIssue, state: 'leaving' })
    }
    for (const column of COLUMNS) {
      const items = empty[column]
      // Preserve animation state across sort: the per-column sort can reorder
      // by status tier (Done) and we must not flip 'changed' onto the wrong card.
      const stateByKey = new Map(items.map((item) => [item.issue.key, item.state]))
      const sortedIssues = sortColumnIssues(
        items.map((item) => item.issue),
        column,
      )
      empty[column] = sortedIssues.map((issue) => ({
        issue,
        state: stateByKey.get(issue.key)!,
      }))
    }
    return empty
  }
  ```

- **New** `src/features/board/assemble-columns.test.ts` — pure tests, no React. ~150 LoC. Coverage:
  - Empty `liveIssues`, empty `leaving` → all four columns empty.
  - One issue per column → each column has one item with `state: 'idle'`.
  - Issue in `enteringKeys` → `state: 'entering'`. In `changedKeys` → `state: 'changed'`. In both → `'entering'` wins (matches today's ternary precedence at `Board.tsx:37–41`).
  - Issue in `leaving` is appended to its frozen column (the `column` field on `LeavingIssue`), not its current `statusName` column — i.e. a `Done`→deleted issue stays in `Done` while fading.
  - `searchQuery` filters both live and leaving issues — a leaving issue whose summary doesn't match the query is omitted.
  - **Animation-key preservation across `Done`-column sort**: seed three `Done` issues with summaries `'fixasap A'`, `'B'`, `'C'`; mark `B` as `'changed'`; assert that after sort (which moves `'fixasap A'` to top per `sortColumnIssues`), `B` retains `state: 'changed'` and `'fixasap A'` is `'idle'`. This is the regression test for the `stateByKey` round-trip.
  - HDR status casing: an issue with `statusName: 'IN STG'` lands in the same column as `statusName: 'In STG'` (relies on `columnForStatus`'s case-insensitive lookup; see `memory/project_jira_status_casing.md`).

- **New** `src/features/board/use-board-view.ts` — ~120 LoC including types.

  ```ts
  import { useMemo } from 'react'
  import type { UseQueryResult } from '@tanstack/react-query'
  import { useBoardData, useMrStatuses } from '~/dashboard'
  import { usePolling } from '~/lib/use-polling'
  import type { SearchIssuesResult } from '~/server/jira'
  import { useChangeIndication } from './use-change-indication'
  import { assembleColumns, type ColumnItem } from './assemble-columns'
  import type { Column } from './status-mapping'

  export const BOARD_POLL_INTERVAL_MS = 60_000

  export type BoardViewDeps = {
    boardQuery: UseQueryResult<SearchIssuesResult>
    /** Called once per render. Production wires `useMrStatuses`; tests pass a no-op. */
    subscribeMrStatuses: () => void
  }

  type ReadyFields = {
    baseUrl: string
    itemsByColumn: Record<Column, ColumnItem[]>
    showErrorBanner: boolean
    errorMessage: string | undefined
    retry: () => void
  }

  export type BoardViewState =
    | { phase: 'loading' }
    | { phase: 'error-hard'; message: string }
    | { phase: 'unauthorized' }
    | { phase: 'empty' }
    | (ReadyFields & { phase: 'ready' })

  export function useBoardView(searchQuery: string): BoardViewState {
    const boardQuery = useBoardData()
    return useBoardViewWithDeps(searchQuery, {
      boardQuery,
      subscribeMrStatuses: () => {
        useMrStatuses()
      },
    })
  }

  export function useBoardViewWithDeps(
    searchQuery: string,
    deps: BoardViewDeps,
  ): BoardViewState {
    const { boardQuery } = deps
    deps.subscribeMrStatuses()
    usePolling(() => {
      boardQuery.refetch()
    }, BOARD_POLL_INTERVAL_MS)

    const liveIssues =
      boardQuery.data?.ok === true ? boardQuery.data.issues : undefined
    const { enteringKeys, changedKeys, leaving } = useChangeIndication(liveIssues)

    const itemsByColumn = useMemo(() => {
      if (liveIssues === undefined) return null
      return assembleColumns({ liveIssues, leaving, enteringKeys, changedKeys, searchQuery })
    }, [liveIssues, leaving, enteringKeys, changedKeys, searchQuery])

    if (boardQuery.isPending) return { phase: 'loading' }
    if (boardQuery.isError && boardQuery.data === undefined) {
      const message =
        boardQuery.error instanceof Error ? boardQuery.error.message : 'unknown error'
      return { phase: 'error-hard', message: `Couldn't load board: ${message}` }
    }
    if (boardQuery.data === undefined || boardQuery.data.ok === false) {
      return { phase: 'unauthorized' }
    }
    if (boardQuery.data.issues.length === 0) return { phase: 'empty' }

    return {
      phase: 'ready',
      baseUrl: boardQuery.data.baseUrl,
      itemsByColumn: itemsByColumn!,
      showErrorBanner: boardQuery.isError,
      errorMessage:
        boardQuery.error instanceof Error ? boardQuery.error.message : undefined,
      retry: () => boardQuery.refetch(),
    }
  }
  ```

  Note on `subscribeMrStatuses`: in production the closure calls `useMrStatuses()` — a hook. The closure is invoked unconditionally on every render of `useBoardViewWithDeps`, so the rules of hooks are preserved (it's the same call shape as inlining the hook). In tests, `subscribeMrStatuses: vi.fn()` swaps in a no-op spy and the production hook is never reached. This is the same trade-off Design A acknowledged: minimal interface, one closure call per render to keep the rules of hooks happy.

- **New** `src/features/board/use-board-view.test.tsx` — hook tests using `renderHook` from `@testing-library/react` (already in use at `src/lib/use-polling.test.ts`, `src/features/board/use-change-indication.test.ts`). Calls `useBoardViewWithDeps(searchQuery, fakeDeps)` directly — no `RouterProvider` needed. ~200 LoC. Coverage:
  - `phase: 'loading'` when `boardQuery.isPending`.
  - `phase: 'error-hard'` with the message prefix `"Couldn't load board: "` when `isError && data === undefined`.
  - `phase: 'unauthorized'` when `data.ok === false`.
  - `phase: 'empty'` when `data.ok === true && data.issues.length === 0`.
  - `phase: 'ready'` produces a populated `itemsByColumn`, `baseUrl` from `data.baseUrl`, `showErrorBanner: false` when `!isError`.
  - `phase: 'ready'` with `isError && data !== undefined` → `showErrorBanner: true`, `errorMessage` set.
  - `subscribeMrStatuses` is called on every render. Polling uses `vi.useFakeTimers()`; advancing 60_000 ms triggers `boardQuery.refetch()`.
  - `retry()` calls `boardQuery.refetch()`.
  - Single end-to-end integration test: seed `boardQuery.data.issues` with two snapshots (one mounted, one updated) via the `renderHook` `rerender` API; assert that an issue moving from `'In Implementation'` to `'Done'` produces `state: 'changed'` for that key in `itemsByColumn['Done']`. (The full enter/change/leave matrix lives in `use-change-indication.test.ts` and `assemble-columns.test.ts`; this test confirms the wiring.)

- **Rewrite** `src/features/board/Board.tsx` — orchestration block collapses to a phase switch. ~110 LoC.

  ```tsx
  import { useBoardView } from './use-board-view'
  import { COLUMNS, type Column } from './status-mapping'
  import type { ColumnItem } from './assemble-columns'
  import { TicketCard } from '~/features/ticket-card'

  export function Board({ searchQuery }: { searchQuery: string }) {
    const view = useBoardView(searchQuery)
    if (view.phase === 'loading') return <BoardSkeleton />
    if (view.phase === 'error-hard') {
      return <BoardMessage tone="destructive">{view.message}</BoardMessage>
    }
    if (view.phase === 'unauthorized') {
      return <BoardMessage tone="destructive">Invalid Jira credentials.</BoardMessage>
    }
    if (view.phase === 'empty') return <EmptyBoardMessage />
    return (
      <div className="flex h-full min-h-0 flex-col">
        {view.showErrorBanner && (
          <ErrorBanner errorMessage={view.errorMessage} onRetry={view.retry} />
        )}
        <div className="grid min-h-0 flex-1 grid-cols-4 gap-4 p-4">
          {COLUMNS.map((column) => (
            <BoardColumn
              key={column}
              column={column}
              items={view.itemsByColumn[column]}
              baseUrl={view.baseUrl}
            />
          ))}
        </div>
      </div>
    )
  }

  // BoardColumn, BoardMessage, BoardSkeleton, SkeletonCard, EmptyBoardMessage,
  // ErrorBanner — all unchanged from today's lines 107–253.
  ```

  **Imports removed** from `Board.tsx`: `useMemo` from `react`; `useBoardData`, `useMrStatuses` from `~/dashboard`; `useChangeIndication`, `LeavingIssue` from `./use-change-indication`; `columnForStatus` from `./status-mapping`; `filterIssues` from `./filter-issues`; `sortColumnIssues` from `./sort-column`; `BoardIssue` from `~/server/jira`; `usePolling` from `~/lib/use-polling`; the `POLL_INTERVAL_MS` constant; the `ColumnItem` local type. `TicketCard` and `TicketCardAnimationState` stay (consumed by `BoardColumn`).

  `ErrorBanner` keeps its current shape — it still computes `Math.round(POLL_INTERVAL_MS / 1000)` for the "Retrying in Ns" copy. That `POLL_INTERVAL_MS` constant moves *with* the banner; it stays a local `const` in `Board.tsx`. (The hook's `BOARD_POLL_INTERVAL_MS` is the source of truth for actual polling; the banner just displays a number, which stays in sync by convention. Acceptable: there's one banner.)

### Cluster B — Quick-create

In `src/features/quick-create/`:

1. **`use-quick-create.ts`** — production hook + test seam. Owns `useState<boolean>` for `open`, the `c` global shortcut effect (with input-typing + modifier guard), the `useCreateAction` mutation, the form-reset registration callback, and the "block close while pending" rule.

2. **Rewrite `QuickCreateButton.tsx`** — markup only. No `useState`, no `useEffect`, no `useRef`, no `openRef`.

3. **Rewrite `QuickCreateModal.tsx`** — accepts a single `qc: QuickCreateState` prop. No `formResetRef`, no `useCreateAction` import, no internal mutation construction. Keeps its `summaryRef` for autofocus (pure DOM, not state).

4. **Rewrite `QuickCreateForm.tsx`** — accepts `submit`, `onCancel`, `open`, `isPending`, `summaryRef`, `registerReset` props. Registers reset via `useEffect(() => registerReset(() => form.reset()), [...])` instead of mutating an external ref on render.

#### Concrete file changes — Cluster B

- **New** `src/features/quick-create/use-quick-create.ts` — ~110 LoC including types.

  ```ts
  import { useCallback, useEffect, useRef, useState } from 'react'
  import { useCreateAction } from '~/dashboard'
  import type { CreateIssueResultWithTimeout } from '~/dashboard/service'
  import type { QuickCreateInput } from '~/server/jira/quick-create-schema'

  export type QuickCreateDeps = {
    submit: (input: QuickCreateInput) => Promise<CreateIssueResultWithTimeout>
    isPending: boolean
  }

  export type QuickCreateState = {
    open: boolean
    isPending: boolean
    /** Pass to <Dialog.Root onOpenChange>. Blocks close while pending. */
    setOpen: (next: boolean) => void
    /** Pass to the trigger button. */
    openModal: () => void
    /** Pass to in-modal Cancel / X. */
    closeModal: () => void
    /** Bind to <form onSubmit> via TanStack Form's handleSubmit. Returns the result. */
    submit: (input: QuickCreateInput) => Promise<CreateIssueResultWithTimeout>
    /** Form calls this once during mount with `() => form.reset()`. */
    registerReset: (reset: () => void) => void
  }

  export function useQuickCreate(): QuickCreateState {
    const [open, setOpenState] = useState(false)
    const resetRef = useRef<(() => void) | null>(null)
    const action = useCreateAction({
      closeModal: () => setOpenState(false),
      resetForm: () => resetRef.current?.(),
    })
    return useQuickCreateWithDeps(
      { submit: action.mutateAsync, isPending: action.isPending },
      { open, setOpen: setOpenState, resetRef },
    )
  }

  type StateHandles = {
    open: boolean
    setOpen: (next: boolean) => void
    resetRef: { current: (() => void) | null }
  }

  export function useQuickCreateWithDeps(
    deps: QuickCreateDeps,
    state: StateHandles,
  ): QuickCreateState {
    const { open, setOpen, resetRef } = state
    const { submit, isPending } = deps

    // 'c' global shortcut to open. Mirrors today's behavior at
    // QuickCreateButton.tsx:10–29 — modifier-guarded, input-typing-guarded,
    // suppressed while already open.
    const openRef = useRef(open)
    openRef.current = open
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key !== 'c') return
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
        if (openRef.current) return
        const target = e.target
        if (
          target instanceof HTMLElement &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable)
        ) {
          return
        }
        e.preventDefault()
        setOpen(true)
      }
      document.addEventListener('keydown', onKeyDown)
      return () => document.removeEventListener('keydown', onKeyDown)
    }, [setOpen])

    const setOpenGuarded = useCallback(
      (next: boolean) => {
        if (isPending && !next) return
        setOpen(next)
      },
      [isPending, setOpen],
    )
    const openModal = useCallback(() => setOpenGuarded(true), [setOpenGuarded])
    const closeModal = useCallback(() => setOpenGuarded(false), [setOpenGuarded])
    const registerReset = useCallback(
      (reset: () => void) => {
        resetRef.current = reset
      },
      [resetRef],
    )

    return {
      open,
      isPending,
      setOpen: setOpenGuarded,
      openModal,
      closeModal,
      submit,
      registerReset,
    }
  }
  ```

  Production wiring keeps `useCreateAction` from `~/dashboard` unchanged — its `onSuccess` already calls `closeModal()` and `resetForm()` on `result.ok`. The hook just owns the two callbacks `useCreateAction` consumes.

- **New** `src/features/quick-create/use-quick-create.test.tsx` — hook tests. Uses `renderHook`. Calls `useQuickCreateWithDeps(deps, state)` directly — no `RouterProvider`, no `vi.mock('sonner')`. `state` is constructed from a top-level `renderHook` wrapper that holds `open` in `useState` and `resetRef` in `useRef`. ~250 LoC. Coverage:
  - Initial state: `open: false`, `isPending: false`, `submit` is the spy from deps.
  - `openModal()` → `open: true`. `closeModal()` while not pending → `open: false`. `closeModal()` while `deps.isPending: true` → `open` unchanged.
  - `setOpen(true)` while `isPending` → `open: true` (only *closing* is blocked).
  - `setOpen(false)` while `isPending` → `open` unchanged.
  - `submit(input)` calls `deps.submit(input)` and resolves with its return value. (Cache invalidate / toast / timeout are tested in `dashboard/service.test.ts`; this hook just forwards.)
  - `registerReset(spy)` then later code calls `state.resetRef.current!()` → `spy` was called. (This proves the registration verb replaces the prop-drilled ref.)
  - **'c' shortcut, modal closed, no input focused** → `setOpen(true)` was called. Dispatched via `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }))`.
  - **'c' shortcut, modal already open** → `setOpen` not called.
  - **'c' shortcut with `metaKey: true`** → not called. Same for `ctrlKey`, `altKey`, `shiftKey`.
  - **'c' shortcut while focused on `<input>`** → not called. Same for `<textarea>`. Same for a `contenteditable` div.
  - **'c' shortcut while focused on `<button>`** → called (confirms we don't suppress on every `HTMLElement`).

- **Rewrite** `src/features/quick-create/QuickCreateButton.tsx` — pure markup. ~25 LoC.

  ```tsx
  import { Plus } from 'lucide-react'
  import { useQuickCreate } from './use-quick-create'
  import { QuickCreateModal } from './QuickCreateModal'

  export function QuickCreateButton() {
    const qc = useQuickCreate()
    return (
      <>
        <button
          type="button"
          onClick={qc.openModal}
          title="New (c)"
          aria-keyshortcuts="c"
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-7 items-center gap-1 rounded px-2.5 text-xs font-medium transition-colors focus-visible:ring-1 focus-visible:outline-none"
        >
          <Plus size={14} />
          <span>New</span>
          <kbd
            aria-hidden="true"
            className="border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground/90 ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded border px-1 font-mono text-[10px] leading-none"
          >
            c
          </kbd>
        </button>
        <QuickCreateModal qc={qc} />
      </>
    )
  }
  ```

  **Imports removed**: `useEffect`, `useRef`, `useState` from `react`. The local `openRef` and the keydown listener are gone.

- **Rewrite** `src/features/quick-create/QuickCreateModal.tsx` — accepts `qc: QuickCreateState`. No `formResetRef`, no `useCreateAction`. ~70 LoC.

  ```tsx
  import { useRef } from 'react'
  import * as Dialog from '@radix-ui/react-dialog'
  import { Loader2, X } from 'lucide-react'
  import type { QuickCreateState } from './use-quick-create'
  import { QuickCreateForm } from './QuickCreateForm'

  export function QuickCreateModal({ qc }: { qc: QuickCreateState }) {
    const summaryRef = useRef<HTMLInputElement>(null)
    return (
      <Dialog.Root open={qc.open} onOpenChange={qc.setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
          <Dialog.Content
            onPointerDownOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => {
              if (qc.isPending) e.preventDefault()
            }}
            onInteractOutside={(e) => {
              if (qc.isPending) e.preventDefault()
            }}
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              summaryRef.current?.focus()
            }}
            className="border-border bg-card text-foreground fixed top-1/2 left-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border p-5 shadow-xl focus:outline-none"
          >
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="text-foreground text-sm font-semibold">
                Quick Create
              </Dialog.Title>
              <Dialog.Close
                aria-label="Close"
                disabled={qc.isPending}
                className={`text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring inline-flex h-6 w-6 items-center justify-center rounded transition-colors focus-visible:ring-1 focus-visible:outline-none ${
                  qc.isPending ? 'pointer-events-none opacity-50' : ''
                }`}
              >
                <X size={14} />
              </Dialog.Close>
            </div>
            <div className={qc.isPending ? 'hidden' : ''}>
              <QuickCreateForm
                summaryRef={summaryRef}
                open={qc.open}
                isPending={qc.isPending}
                onCancel={qc.closeModal}
                onSubmit={qc.submit}
                registerReset={qc.registerReset}
              />
            </div>
            {qc.isPending && (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
                <span className="text-foreground text-sm">Creating your ticket…</span>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )
  }
  ```

  **Imports removed**: `useCreateAction` from `~/dashboard`. The `formResetRef` allocation and the wrapper `setOpen` (`(next) => { if (isPending && !next) return; setOpen(next) }`) are gone — the guard moved into `useQuickCreate`'s `setOpenGuarded`.

- **Rewrite** `src/features/quick-create/QuickCreateForm.tsx` — accepts `submit`, `onCancel`, `open`, `isPending`, `summaryRef`, `registerReset` props. The `mutation`, `closeModal`, `resetRef` props are gone. Form registration is via `useEffect`, not render-time mutation. ~140 LoC.

  ```tsx
  import { useEffect, type RefObject } from 'react'
  import { useForm } from '@tanstack/react-form'
  import {
    quickCreateSchema,
    type QuickCreateInput,
  } from '~/server/jira/quick-create-schema'
  import type { CreateIssueResultWithTimeout } from '~/dashboard/service'
  import { ParentSelect } from './ParentSelect'
  import { SummaryInput } from './SummaryInput'
  import { TypeSegmented } from './TypeSegmented'

  const DEFAULT_VALUES: QuickCreateInput = {
    type: 'Bug',
    parentKey: '',
    summary: '',
    description: '',
  }

  // ...REQUIRED_LABEL_CLASS, REQUIRED_ASTERISK, INPUT_CLASS unchanged...

  export function QuickCreateForm({
    summaryRef,
    open,
    isPending,
    onCancel,
    onSubmit,
    registerReset,
  }: {
    summaryRef: RefObject<HTMLInputElement | null>
    open: boolean
    isPending: boolean
    onCancel: () => void
    onSubmit: (input: QuickCreateInput) => Promise<CreateIssueResultWithTimeout>
    registerReset: (reset: () => void) => void
  }) {
    const form = useForm({
      defaultValues: DEFAULT_VALUES,
      validators: { onChange: quickCreateSchema },
      onSubmit: async ({ value }) => {
        await onSubmit(value)
      },
    })

    useEffect(() => {
      registerReset(() => form.reset())
    }, [registerReset, form])

    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
        className="flex flex-col gap-3"
      >
        {/* ...form.Field blocks unchanged: type, parentKey, summary, description... */}
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="..."
          >
            Cancel
          </button>
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting] as const}
            children={([canSubmit, isSubmitting]) => (
              <button
                type="submit"
                disabled={!canSubmit || isSubmitting || isPending}
                className="..."
              >
                Create
              </button>
            )}
          />
        </div>
      </form>
    )
  }
  ```

  **Render-time mutation gone**: line 48 (`resetRef.current = () => form.reset()`) becomes `useEffect(() => registerReset(() => form.reset()), [registerReset, form])`. The reset callback is registered after mount, not during every render.

  **Type import for the mutation removed**: `useCreateAction` is no longer referenced. The `CreateIssueResultWithTimeout` type comes from `~/dashboard/service` (already exported).

### Wiring at the composition root

No composition-root changes. `useBoardView` consumes `useBoardData`, `useMrStatuses` (both from `~/dashboard`), `usePolling` (from `~/lib`). `useQuickCreate` consumes `useCreateAction` (from `~/dashboard`), which in turn consumes `useDashboardService()` — already wired through `<DashboardProvider>` (#35). The test seams (`useBoardViewWithDeps`, `useQuickCreateWithDeps`) take their dependencies as arguments; tests do not need `RouterProvider`, do not call `vi.mock('sonner')`, and do not stub globals.

### Tests — replace, don't layer

- **New** `src/features/board/assemble-columns.test.ts` (per coverage above).
- **New** `src/features/board/use-board-view.test.tsx` (per coverage above).
- **Keep** `src/features/board/filter-issues.test.ts`, `sort-column.test.ts`, `status-mapping.test.ts`, `use-change-indication.test.ts`, `deemphasize.test.ts` — pure helpers, unaffected.
- **New** `src/features/quick-create/use-quick-create.test.tsx` (per coverage above).
- **No existing tests** for `quick-create/`; nothing to delete.

### Caller migration — net effect per file

| File | Before (LoC) | After (LoC) | Net change |
|---|---|---|---|
| `src/features/board/Board.tsx` | 253 | ~110 | −143 |
| `src/features/board/use-board-view.ts` | 0 (new) | ~120 | +120 |
| `src/features/board/assemble-columns.ts` | 0 (new) | ~35 | +35 |
| `src/features/board/use-board-view.test.tsx` | 0 (new) | ~200 | +200 |
| `src/features/board/assemble-columns.test.ts` | 0 (new) | ~150 | +150 |
| `src/features/board/index.ts` | unchanged | unchanged | 0 |
| `src/features/quick-create/QuickCreateButton.tsx` | 53 | ~25 | −28 |
| `src/features/quick-create/QuickCreateModal.tsx` | 81 | ~70 | −11 |
| `src/features/quick-create/QuickCreateForm.tsx` | 147 | ~140 | −7 |
| `src/features/quick-create/use-quick-create.ts` | 0 (new) | ~110 | +110 |
| `src/features/quick-create/use-quick-create.test.tsx` | 0 (new) | ~250 | +250 |
| `src/features/quick-create/index.ts` | unchanged | unchanged | 0 |
| `src/dashboard/hooks.ts` (`useCreateAction`) | unchanged | unchanged | 0 |
| `src/routes/index.tsx` | unchanged | unchanged | 0 |

**Net effect: ~190 LoC of orchestration converted into two testable hooks plus one extracted pure helper, and ~600 LoC of new tests covering integration paths that today have zero coverage.** The `formResetRef` ref-bridge and the global `c` shortcut effect both leave the component layer.

## Acceptance criteria

### Cluster A — Board

- [ ] `src/features/board/use-board-view.ts` and `assemble-columns.ts` exist with the shapes above.
- [ ] `src/features/board/assemble-columns.ts` has **zero React imports**. Greppable: `^import .* from .react.` in that file returns no matches.
- [ ] `src/features/board/Board.tsx` does not import `useMemo` from `react`, `useBoardData` / `useMrStatuses` from `~/dashboard`, `useChangeIndication` / `LeavingIssue` from `./use-change-indication`, `filterIssues` from `./filter-issues`, `sortColumnIssues` from `./sort-column`, `usePolling` from `~/lib/use-polling`, or `BoardIssue` from `~/server/jira`. Greppable.
- [ ] `src/features/board/Board.tsx` does not call `useEffect`, `useMemo`, `useState`, or `usePolling`. Greppable.
- [ ] `src/features/board/use-board-view.test.tsx` does **not** call `vi.mock`, `vi.stubGlobal`, and does not import `sonner` or `@tanstack/react-router`. The `useBoardViewWithDeps` test seam is the entry point.
- [ ] The animation-key preservation test in `assemble-columns.test.ts` passes — a `Done`-column reorder by `sortColumnIssues` does not flip `'changed'` onto the wrong card.
- [ ] The polling test in `use-board-view.test.tsx` uses `vi.useFakeTimers()` and asserts `boardQuery.refetch` fires after 60_000 ms.

### Cluster B — Quick-create

- [ ] `src/features/quick-create/use-quick-create.ts` exists with the shape above.
- [ ] `src/features/quick-create/QuickCreateButton.tsx` does not import `useEffect`, `useRef`, `useState` from `react`. Greppable.
- [ ] `src/features/quick-create/QuickCreateModal.tsx` does not import `useCreateAction` from `~/dashboard` and does not allocate a `formResetRef`. Greppable: `formResetRef` returns no matches in `QuickCreateModal.tsx`.
- [ ] `src/features/quick-create/QuickCreateForm.tsx` does not mutate any external `RefObject` during render. Greppable: `resetRef.current = ` returns no matches in `QuickCreateForm.tsx`. The `form.reset()` registration happens inside a `useEffect`.
- [ ] `src/features/quick-create/use-quick-create.test.tsx` does **not** call `vi.mock('sonner')`, does not import `@tanstack/react-router`, and does not import any `getXxx` server function. The `useQuickCreateWithDeps` test seam is the entry point.
- [ ] All shortcut guards (`metaKey`, `ctrlKey`, `altKey`, `shiftKey`, `<input>`-focused, `<textarea>`-focused, `contenteditable`-focused, modal-already-open) are exercised by at least one test in `use-quick-create.test.tsx`. The `<button>`-focused case asserts the shortcut DOES fire.
- [ ] The "block close while pending" rule has tests for both directions: `setOpen(false)` while `isPending` → no-op; `setOpen(true)` while `isPending` → applied.

### Both

- [ ] All existing tests pass with no behavioral change. Manual smoke: load the board, search, watch a status change pulse, watch a card leave; press `c` to open the modal, press `c` while typing in description (must not re-open), submit a ticket, press `c` again (form is reset).
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

None. Independent of #33–#36; lands cleanly on top of the deepened `DashboardCache` + `DashboardService` (uses `useBoardData` / `useMrStatuses` / `useCreateAction` from `~/dashboard`).

## Out of scope

- **Moving `searchQuery` into route search params (`?q=`).** Today it lives as a `useState` in `routes/index.tsx` and is threaded into `Board` and `Header`. URL-driven search is a separate refactor (deep-linking, refresh-survives) and adds surface area to this issue for no testability gain.
- **Renaming `QuickCreateButton` → `QuickCreate` and merging `QuickCreateButton.tsx` + `QuickCreateModal.tsx`.** Cosmetic rename; the two-file split is fine after the hook lands. `Header.tsx` keeps importing `QuickCreateButton` from `~/features/quick-create`.
- **Inlining `useCreateAction` into `useQuickCreate`.** It's a thin wrapper over `service.createIssue` with `onSuccess` callbacks. It's tested transitively via `service.test.ts` and stays as the integration point; killing it would require either re-implementing the mutation in `useQuickCreate` or reaching directly into `useDashboardService()` here. Either way the saving is small and the surface change is large.
- **Hoisting `shouldHandleShortcut` from `~/features/ticket-detail` to `~/lib`.** The `c` shortcut in `useQuickCreate` uses `event.target` (which is the today-shipped behavior at `QuickCreateButton.tsx:15–23`); the issue-panel shortcuts in #36 use `document.activeElement`. Different semantics — converging them is a separate, behavior-changing refactor.
- **`ParentSelect.tsx`'s internal popover state, `useMyEpics`, and `HARDCODED_PARENTS` merging.** The hook orchestrates the modal lifecycle, not the parent picker. `ParentSelect` keeps its own `useState`, `useEffect`, and query.
- **`SummaryInput.tsx`, `TypeSegmented.tsx`, `hardcoded-parents.ts`.** Unchanged.
- **A second board view** (per-epic mini-board, archive view) or a **second quick-create caller** (create-from-MR, create-epic). Neither exists today; speculative generalization is deferred. If a second consumer appears, parameterize then.
- **Configurable polling cadence or shortcut keymap.** Both hardcoded, per CLAUDE.md ("No abstractions for single-use code").
- **`use-change-indication.ts` internals.** Its public shape (`{ enteringKeys, changedKeys, leaving }`) is consumed by `useBoardView` and stays exactly as today. Its existing test (`use-change-indication.test.ts`) is unchanged.
- **`Header.tsx` and `routes/index.tsx`.** No changes — `<Board searchQuery={searchQuery} />` keeps the same prop shape.

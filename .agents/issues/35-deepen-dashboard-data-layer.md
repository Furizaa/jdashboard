# 35 — Deepen client cache + cross-feature orchestration behind a `DashboardCache` port

**Type:** AFK

## Parent

Architecture refactor — no parent PRD. Same shape as [33-deepen-jira-module](./33-deepen-jira-module.md) and [34-deepen-gitlab-module](./34-deepen-gitlab-module.md), applied to the *client* side. Issues 33 and 34 deepened the server modules behind `JiraGateway` / `GitlabGateway` ports; this issue brings the same port + adapter + service split to the React-Query cache and to the cross-feature choreography that today is open-coded across feature folders.

## Background

The current shape of the client-side data layer:

- Five query keys live in five different feature folders, each defined ad-hoc:
  - `boardIssuesQueryKey = ['jira', 'board', 'issues']` in `src/features/board/use-board-issues.ts:4`
  - `issueQueryKey = (key) => ['jira', 'issue', key]` in `src/features/ticket-detail/use-issue.ts:4`
  - `transitionsQueryKey = (key) => ['jira', 'transitions', key]` in `src/features/status-pill/use-transitions.ts:4`
  - `mrStatusesQueryKey = ['mr-statuses']` in `src/features/mr-status/use-mr-statuses.ts:9`
  - A LOCAL `ISSUE_QUERY_PREFIX = ['jira', 'issue']` in `src/features/header/Header.tsx:12`, **duplicating** ticket-detail's prefix to invalidate every issue cache on refresh
- Mutations import keys across feature boundaries:
  - `src/features/status-pill/use-transition-mutation.ts:9-10` imports `boardIssuesQueryKey` from `~/features/board` AND `issueQueryKey` from `~/features/ticket-detail`, hand-rolls optimistic patches + rollback for both caches in `onMutate` / `onError` / `onSuccess`, then invalidates a third key (`['jira', 'transitions', variables.key]`) inline as a tuple — bypassing the `transitionsQueryKey` factory that exists for that purpose.
  - `src/features/quick-create/use-create-issue-mutation.ts:5,48` imports `boardIssuesQueryKey` from `~/features/board` to invalidate after a quick-create.
  - `src/features/header/Header.tsx:5,6,32-35` imports `boardIssuesQueryKey` AND `mrStatusesQueryKey` from two other features, plus the local duplicated `ISSUE_QUERY_PREFIX`, to fan out three invalidations.
- Cross-feature *choreography* is open-coded in click handlers:
  - `src/features/mr-status/MrSection.tsx:6,7,62-90` (`CodeReviewSection` merged branch) imports `transitionsQueryKey` AND `useTransitionMutation` from `~/features/status-pill` AND `getTransitions` from `~/server/jira`; in a click handler, calls `queryClient.fetchQuery({ queryKey: transitionsQueryKey(issueKey), queryFn: () => getTransitions(...) })`, lowercase-matches `'In STG'`, routes a toast based on the `data.reason`, then calls `transitionMutation.mutate(...)`. ~30 LOC of cross-feature plumbing in a single click handler.
  - `src/features/board/Board.tsx:24` calls `useMrStatuses()` purely for its side effect — return value ignored — because that is the only thing that causes MR data to load. The dependency is invisible from the call site; deleting that line breaks `MrSection` rendering elsewhere on the page.
  - `src/features/mr-status/use-mr-statuses.ts:23-24` gates its own fetch on `useBoardIssues().data !== undefined`. `mr-status` reaches into `board` to ask "are we ready yet?" — there is no port, just a hook-to-hook reach-around.
- `src/features/mr-status/use-mr-statuses.ts:14` declares a module-level `let unauthorizedToastShown = false` singleton to dedup the "GitLab auth failed" toast. Untestable. Persists across hook remounts. Resets only on a full page reload.
- `src/features/quick-create/use-create-issue-mutation.ts:26-41` hand-rolls `AbortController` + `setTimeout` + a `timedOut` flag inside the `mutationFn` to enforce a 10-second timeout. The error path threads through a private `CreateIssueTimeoutError` class. None of it is tested.

Real bugs hide in the same seam issues 33 and 34 already addressed for their layers: the cross-feature orchestration (optimistic-update + rollback for two caches in tandem; "merged MR → fetch transitions → find target status → mutate"; "refresh all" fan-out) has zero tests because there is no port to inject a fake. Pure helpers (`columnForStatus`, `resolveTransition`, `summarizeMr`) are tested in isolation; the wiring that puts them together is invisible. A reader who renames `boardIssuesQueryKey` finds three import sites by grep but cannot find the local duplicate `ISSUE_QUERY_PREFIX` in `Header.tsx` without reading the file. A test of "after a transition, the board AND the detail panel are rolled back when the server rejects" requires mounting React, stubbing `fetch`, and rendering at least three components.

The goal: collapse the cluster behind a `DashboardCache` port and a `DashboardService` domain layer, mirroring the shape of `~/server/jira/*` post-#33 exactly so the parallel is obvious. Query keys live in one place. The optimistic-update-with-rollback and the merged-MR fanout are testable against a hand-rolled fake cache (no `vi.mock`, no `QueryClient`, no React tree). Feature folders stop importing each other's query keys.

## What to build

Three internal layers behind a small set of thin React hooks:

1. **`DashboardCache` port** — domain-grained interface defining the cache operations the service needs. NOT TanStack-specific — `QueryClient`, `QueryKey`, and `QueryClientProvider` types do not appear in this file. Methods are nouns from the dashboard's domain (`patchBoard`, `invalidateMrStatuses`, `fetchTransitions`), not generic key-based primitives (`setQueryData(key, fn)`). Returns `Rollback` handles for optimistic patches so the service can compose them across multiple caches.

2. **`TanstackDashboardCache` adapter** — production implementation. Owns the five query-key tuples (`['jira', 'board', 'issues']`, `['jira', 'issue', key]`, `['jira', 'transitions', key]`, `['mr-statuses']`) — none of them are exported. Owns the staleTime / retry config for each. Each port method delegates to one or two `QueryClient` calls.

3. **`DashboardService`** — domain layer. Consumes the port; owns choreography. Owns: `applyTransition` (cancel both inflight queries, snapshot both caches, optimistic-patch both, run the mutation, rollback on error or `result.ok === false`, invalidate detail + transitions on success); `createIssue` (10-second timeout via injected `clock`/`setTimeout`/`clearTimeout`, invalidate board on success, surface `'timed-out'` reason on the result type); `handleMrMerged` (fetch transitions for the issue, find the case-insensitive match for `targetStatusName`, route the rejection / no-target / not-found toast cases, dispatch `applyTransition`); `refreshAll` (invalidate board + all issues + transitions + mr-statuses, in that order); `notifyUnauthorizedOnce(service)` (per-instance dedup state — kills the module-level singleton).

The four cross-feature query keys, the `ISSUE_QUERY_PREFIX` duplicate in `Header.tsx`, the optimistic + rollback machinery in `use-transition-mutation.ts`, the merged-MR plumbing in `MrSection.tsx`, and the `unauthorizedToastShown` flag all disappear from feature folders.

The React hooks at the surface are 5–15 lines each, just bridging React state (`useQuery` / `useMutation`) to the service. Hooks are allowed to know their own key (because `useQuery` requires a stable key tuple as input); feature folders are not.

### Concrete file changes

- **New** `src/dashboard/cache.ts` — defines `DashboardCache` port, `Rollback`, `Patch<T>`, and the result-shape aliases the port returns. No TanStack types.

  ```ts
  export type Patch<T> = (prev: T | undefined) => T | undefined
  export type Rollback = () => void

  export type DashboardCache = {
    readBoard(): SearchIssuesResult | undefined
    readIssue(key: string): GetIssueResult | undefined
    readTransitions(key: string): GetTransitionsResult | undefined
    readMrStatuses(): GetMrStatusesResult | undefined

    fetchTransitions(key: string): Promise<GetTransitionsResult>

    patchBoard(patch: Patch<SearchIssuesResult>): Rollback
    patchIssue(key: string, patch: Patch<GetIssueResult>): Rollback

    cancelBoard(): Promise<void>
    cancelIssue(key: string): Promise<void>

    invalidateBoard(): void
    invalidateIssue(key: string): void
    invalidateAllIssues(): void
    invalidateTransitions(key: string): void
    invalidateMrStatuses(): void
  }
  ```

- **New** `src/dashboard/tanstack-cache.ts` — `createTanstackDashboardCache(queryClient: QueryClient): DashboardCache`. Owns the four key tuples as private constants:

  ```ts
  const KEY_BOARD = ['jira', 'board', 'issues'] as const
  const KEY_ISSUE = (k: string) => ['jira', 'issue', k] as const
  const KEY_ISSUE_PREFIX = ['jira', 'issue'] as const
  const KEY_TRANSITIONS = (k: string) => ['jira', 'transitions', k] as const
  const KEY_MR = ['mr-statuses'] as const
  ```

  Plus the staleTime / retry config used to seed `useQuery` defaults. `KEY_*` are not exported from the module; the only consumers are this file and the hooks file (next bullet). `invalidateAllIssues()` is the only path that uses `KEY_ISSUE_PREFIX`, replacing the duplicated `ISSUE_QUERY_PREFIX` in `Header.tsx`.

- **New** `src/dashboard/service.ts` — `createDashboardService(deps: DashboardServiceDeps): DashboardService`. Service interface:

  ```ts
  export type DashboardService = {
    applyTransition(input: { key: string; transitionId: string; toStatusName: string }): Promise<TransitionIssueResult>
    createIssue(input: QuickCreateInput): Promise<CreateIssueResult>
    handleMrMerged(input: { key: string; targetStatusName: string }): Promise<HandleMrMergedResult>
    refreshAll(): void
    notifyUnauthorizedOnce(service: 'gitlab'): void
  }

  export type HandleMrMergedResult =
    | { ok: true; transitionId: string }
    | { ok: false; reason: 'unauthorized' | 'transitions-failed' | 'no-direct-transition' | 'transition-rejected'; message?: string }
  ```

  Deps shape:
  ```ts
  type DashboardServiceDeps = {
    cache: DashboardCache
    jira: {
      transitionIssue: typeof transitionIssue
      createIssue: typeof createIssue
    }
    clock: () => number
    setTimeout: (fn: () => void, ms: number) => unknown
    clearTimeout: (handle: unknown) => void
    createIssueTimeoutMs: number
    toast: { success: (msg: string, opts?: ToastOptions) => void; error: (msg: string, opts?: ToastOptions) => void }
    notifyUnauthorizedOnceImpl?: (service: 'gitlab') => void  // optional; default uses internal Set
  }
  ```

  The injected `clock` / `setTimeout` / `clearTimeout` make the create-issue timeout deterministic in tests (matches the injected `clock` in `GitlabMrServiceConfig` post-#34). The injected `toast` lets tests assert the toast contract without `vi.mock('sonner')`. Per-instance unauthorized-dedup state lives in a `Set<'gitlab'>` closure; resets on service construction so each test gets a fresh slate.

  `applyTransition` flow (replacing the `onMutate` / `onError` / `onSuccess` block in `use-transition-mutation.ts`):
  1. `await Promise.all([cache.cancelBoard(), cache.cancelIssue(key)])`
  2. Capture two `Rollback` handles by `cache.patchBoard(...)` + `cache.patchIssue(key, ...)` with the optimistic status patch.
  3. `await jira.transitionIssue({ data: { key, transitionId } })`.
  4. On thrown error or `result.ok === false`: call both rollbacks, `toast.error(...)`, return result.
  5. On success: `cache.invalidateIssue(key)` + `cache.invalidateTransitions(key)`. Return result.

  `createIssue` flow (replacing the `AbortController` dance in `use-create-issue-mutation.ts`):
  - Wrap the call in a `withTimeout(p, ms, clock, setTimeout, clearTimeout)` private helper. On timeout, return `{ ok: false, reason: 'timed-out', message: 'Request timed out' }` — adds `'timed-out'` to the existing `CreateIssueResult` discriminated union (extension; existing `ok: false; reason: 'unauthorized' | 'rejected'` cases remain).
  - On `ok: true`: `cache.invalidateBoard()` + `toast.success(...)` with `Open` / `View in Jira` actions. Navigate is **not** the service's responsibility — the hook layer wires `navigate` into the toast `action.onClick`, since `useNavigate` is a hook.

  `handleMrMerged` flow (replacing the merged-MR click handler in `MrSection.tsx`):
  1. `const t = await cache.fetchTransitions(key)`.
  2. If `!t.ok`: route toast (`unauthorized` → "Invalid Jira credentials"; else "Couldn't load transitions"), return `{ ok: false, reason: 'transitions-failed', message }`.
  3. Find `t.transitions.find((x) => x.toStatusName.toLowerCase() === targetStatusName.toLowerCase())`. If none: toast(`No direct transition to ${targetStatusName}. Move ${key} in Jira.`), return `{ ok: false, reason: 'no-direct-transition' }`.
  4. Call `applyTransition({ key, transitionId: target.id, toStatusName: targetStatusName })`. Map result.

  `refreshAll`:
  - `cache.invalidateBoard()`; `cache.invalidateAllIssues()`; `cache.invalidateMrStatuses()`. (Transitions intentionally not invalidated — they're refetched on demand when a status pill opens.)

- **New** `src/dashboard/hooks.ts` — thin React-side wrappers (5–15 lines each):

  ```ts
  export function useBoardData(): UseQueryResult<SearchIssuesResult>
  export function useTicket(key: string | null): UseQueryResult<GetIssueResult>
  export function useTransitions(key: string, enabled: boolean): UseQueryResult<GetTransitionsResult>
  export function useMrStatuses(): UseQueryResult<GetMrStatusesResult>      // gates internally on board-ready
  export function useMrFor(key: string): MrStatusResult                      // shape preserved from today
  export function useTransitionAction(): { mutate: (v: TransitionVars) => void; isPending: boolean }
  export function useCreateAction(opts: { closeModal: () => void; resetForm: () => void }): { mutate: (v: QuickCreateInput) => void; isPending: boolean }
  export function useMrMergedAction(): (input: { key: string; targetStatusName: string }) => Promise<void>
  export function useRefreshAll(): () => void
  ```

  Each hook calls `useDashboard()` (context consumer) for the service + `queryClient`, then wraps `useQuery` / `useMutation` with the appropriate (private-to-this-file) key tuple. `useMrStatuses` keeps the `enabled: !!cache.readBoard()` gate via `useBoardData().data !== undefined`. Polling stays per-hook via `usePolling` — explicitly out of scope to centralize that.

  `useMrStatuses`'s `useEffect` that calls `notifyUnauthorizedOnce` on `result.data.ok === false && result.data.reason === 'unauthorized'` calls `service.notifyUnauthorizedOnce('gitlab')` instead of the module-level `notifyUnauthorizedOnce()` function. The service holds the dedup state.

- **New** `src/dashboard/provider.tsx` — `<DashboardProvider>` builds the service once via `useMemo`, supplies it through React context. Mounted at the route root inside the existing `QueryClientProvider`.

- **New** `src/dashboard/index.ts` — public surface: `<DashboardProvider>`, the hooks (`useBoardData`, `useTicket`, `useTransitions`, `useMrStatuses`, `useMrFor`, `useTransitionAction`, `useCreateAction`, `useMrMergedAction`, `useRefreshAll`). Types: `MrStatusResult` (preserved shape, re-exported for callers that pattern-match on it). **Not exported**: `DashboardCache`, `DashboardService`, the key constants, `createTanstackDashboardCache`, `createDashboardService`. Those are internal — they are imported in `provider.tsx` and the test file, nowhere else.

- **Delete** `src/features/board/use-board-issues.ts`'s `boardIssuesQueryKey` export — the function `useBoardIssues` itself moves to a 2-line wrapper in `src/dashboard/hooks.ts` as `useBoardData`. Callers update.
- **Delete** `src/features/ticket-detail/use-issue.ts`'s `issueQueryKey` export — `useIssue` becomes `useTicket` in `src/dashboard/hooks.ts`. Callers update.
- **Delete** `src/features/status-pill/use-transitions.ts`'s `transitionsQueryKey` export — `useTransitions` moves into `src/dashboard/hooks.ts`. The `MrSection.tsx` usage of `transitionsQueryKey` dies via `service.handleMrMerged`.
- **Delete** `src/features/status-pill/use-transition-mutation.ts` — entire file folded into `service.ts` (`applyTransition`) and `hooks.ts` (`useTransitionAction`). The cross-feature imports of `boardIssuesQueryKey` and `issueQueryKey` die.
- **Delete** `src/features/mr-status/use-mr-statuses.ts`'s `mrStatusesQueryKey` export and its module-level `unauthorizedToastShown` flag and `notifyUnauthorizedOnce` function. `useMrStatuses` and `useMrFor` move into `src/dashboard/hooks.ts`. The dedup state moves into the service.
- **Delete** `src/features/quick-create/use-create-issue-mutation.ts` — entire file folded into `service.ts` (`createIssue`) and `hooks.ts` (`useCreateAction`). The `boardIssuesQueryKey` import, the `CreateIssueTimeoutError` class, and the inline `AbortController`/`setTimeout` dance die.
- **Rewrite** `src/features/header/Header.tsx` lines 1–35 — `useQueryClient`, `boardIssuesQueryKey`, `mrStatusesQueryKey`, and the local `ISSUE_QUERY_PREFIX` imports/constant all delete; the `refresh` body becomes:
  ```ts
  const refresh = useRefreshAll()
  const board = useBoardData()
  ```
- **Rewrite** `src/features/board/Board.tsx` line 24 — `useMrStatuses()` side-effect call **stays** but moves to importing from `~/dashboard` instead of `~/features/mr-status`. The ad-hoc gating that today lives in `use-mr-statuses.ts` is preserved inside the new hook unchanged. (Eliminating the side-effect call entirely is a separate cleanup; this issue keeps it.)
- **Rewrite** `src/features/mr-status/MrSection.tsx` lines 1–98 — replace the merged-MR click-handler block (`handleMergedClick`, lines 62–90) with:
  ```ts
  const merge = useMrMergedAction()
  // ... in JSX:
  <MrWarning
    text={`MR is merged — move ticket to ${MERGED_TARGET_STATUS}`}
    onClick={() => merge({ key: issueKey, targetStatusName: MERGED_TARGET_STATUS })}
    viewMrUrl={summary.webUrl}
  />
  ```
  The `useQueryClient`, `transitionsQueryKey`, `useTransitionMutation`, and `getTransitions` imports all die. The `useMrStatus` and `useMrFor` import path updates from `./use-mr-statuses` to `~/dashboard`.
- **Rewrite** `src/features/status-pill/StatusPillSelect.tsx` and any other callers of `useTransitionMutation` — import path moves from `~/features/status-pill` to `~/dashboard` and the hook is renamed to `useTransitionAction`. Call shape preserved.
- **Rewrite** `src/features/quick-create/QuickCreateForm.tsx` (and any caller of `useCreateIssueMutation`) — import path moves to `~/dashboard`, hook renamed to `useCreateAction`. Call shape preserved.
- **Rewrite** `src/features/header/GitlabIndicator.tsx` — **unchanged** (its `getGitlabUser` query has no cross-feature coupling; out of scope).
- **Rewrite** `src/features/auth-status/AuthGate.tsx` — **unchanged** (its `getMyself` query has no cross-feature coupling; out of scope).
- **Rewrite** `src/features/quick-create/use-my-epics.ts` — **unchanged** (its `myEpicsQueryKey` is local to `quick-create`; no cross-feature coupling; out of scope).

### Wiring at the composition root

```tsx
// src/routes/__root.tsx (or wherever QueryClientProvider lives)
<QueryClientProvider client={queryClient}>
  <DashboardProvider>
    <Outlet />
    <Toaster />
  </DashboardProvider>
</QueryClientProvider>
```

```tsx
// src/dashboard/provider.tsx
export function DashboardProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const service = useMemo(() => {
    const cache = createTanstackDashboardCache(queryClient)
    return createDashboardService({
      cache,
      jira: { transitionIssue, createIssue },
      clock: () => Date.now(),
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
      createIssueTimeoutMs: 10_000,
      toast: { success: toast.success, error: toast.error },
    })
  }, [queryClient])
  return <DashboardCtx.Provider value={service}>{children}</DashboardCtx.Provider>
}
```

The service is bound to the React tree, one instance per `QueryClient`. No module-level singleton (a deliberate departure from the `service()` accessor in `~/server/jira/server-functions.ts` and `~/server/gitlab/server-functions.ts` — the client side can't be a module-level singleton because tests need fresh `QueryClient` instances per test, and React already gives us a natural lifetime via context). Tests bypass the provider entirely and instantiate the service directly with a hand-rolled fake `DashboardCache`.

### Tests — replace, don't layer

- **Delete** `src/features/status-pill/use-transition-mutation.test.ts` if it exists, or any test that mounts the transition mutation against a `QueryClient` + `vi.mock`. The new test exercises the orchestration via the service.
- **New** `src/dashboard/service.test.ts` — exercises the service against a hand-rolled fake `DashboardCache`. **No `vi.mock`. No `fetch` stub. No React tree. No `QueryClient`.**

  Helper:
  ```ts
  type Calls = string[]

  function fakeCache(overrides: Partial<DashboardCache>, calls: Calls = []): DashboardCache {
    const notImpl = (m: string) => () => {
      throw new Error(`fakeCache.${m} not used in this test`)
    }
    const noopRollback = () => () => { calls.push('rolled-back') }
    return {
      readBoard: notImpl('readBoard'),
      readIssue: notImpl('readIssue'),
      readTransitions: notImpl('readTransitions'),
      readMrStatuses: notImpl('readMrStatuses'),
      fetchTransitions: notImpl('fetchTransitions') as DashboardCache['fetchTransitions'],
      patchBoard: noopRollback,
      patchIssue: noopRollback,
      cancelBoard: async () => { calls.push('cancelBoard') },
      cancelIssue: async (k) => { calls.push(`cancelIssue:${k}`) },
      invalidateBoard: () => { calls.push('invalidateBoard') },
      invalidateIssue: (k) => { calls.push(`invalidateIssue:${k}`) },
      invalidateAllIssues: () => { calls.push('invalidateAllIssues') },
      invalidateTransitions: (k) => { calls.push(`invalidateTransitions:${k}`) },
      invalidateMrStatuses: () => { calls.push('invalidateMrStatuses') },
      ...overrides,
    } as DashboardCache
  }

  function fakeToast() {
    const successes: string[] = []
    const errors: string[] = []
    return { successes, errors, toast: { success: (m: string) => { successes.push(m) }, error: (m: string) => { errors.push(m) } } }
  }
  ```

  Coverage at minimum:

  - `applyTransition` cancels both inflight queries before snapshotting (asserts `cancelBoard` and `cancelIssue:KEY` appear in `calls` before any patch is recorded).
  - `applyTransition` patches both board and issue caches with the new `toStatusName` (assert via spy patches that capture the input data and output).
  - `applyTransition` rolls back BOTH caches when `transitionIssue` throws — asserts both rollback closures fire.
  - `applyTransition` rolls back BOTH caches AND invokes `toast.error` with the server message when `transitionIssue` returns `{ ok: false, message }` — asserts the `result.ok === false` rollback path that today is open-coded in `onSuccess`.
  - `applyTransition` does NOT roll back, AND invalidates `issue` + `transitions` (NOT `board`), when `transitionIssue` returns `{ ok: true }`.
  - `createIssue` returns `{ ok: false, reason: 'timed-out' }` when the injected fake clock advances past `createIssueTimeoutMs` and no result has come back. Verified with a manually-pumpable promise + a fake `setTimeout`/`clearTimeout` recorded into `calls`. No real timer used.
  - `createIssue` invalidates board on `ok: true` and does NOT invalidate board on any `ok: false` reason.
  - `createIssue` fires `toast.success` with the issue key on `ok: true`.
  - `handleMrMerged` returns `{ ok: false, reason: 'transitions-failed' }` AND fires the `'Invalid Jira credentials'` toast when `fetchTransitions` returns `{ ok: false, reason: 'unauthorized' }`.
  - `handleMrMerged` returns `{ ok: false, reason: 'transitions-failed' }` AND fires the `"Couldn't load transitions"` toast when `fetchTransitions` returns `{ ok: false, reason: 'rejected' }`.
  - `handleMrMerged` finds the transition **case-insensitively** (`fetchTransitions` returns one with `toStatusName: 'in stg'`, input `targetStatusName: 'In STG'`) and dispatches `transitionIssue` with that transition's id.
  - `handleMrMerged` returns `{ ok: false, reason: 'no-direct-transition' }` AND fires the toast with the issue key interpolated when no transition matches the target.
  - `refreshAll` invokes `invalidateBoard`, `invalidateAllIssues`, `invalidateMrStatuses` in that order, AND does NOT invoke `invalidateTransitions` (transitions refetch on demand when a pill opens).
  - `notifyUnauthorizedOnce('gitlab')` invokes `toast.error` exactly once across multiple calls — kills the module-level singleton's untested behavior.

- **Optional, recommended** `src/dashboard/tanstack-cache.test.ts` — thin adapter test against a real `QueryClient`. Pin the four key tuples (assert `cache.invalidateBoard()` invalidates exactly the queries with key `['jira', 'board', 'issues']`); assert `invalidateAllIssues()` invalidates by the `['jira', 'issue']` prefix; assert `patchBoard` returns a `Rollback` that restores the previous cached value; assert `cancelBoard` resolves without error when no query is in flight. One test per port method is enough — these are integration smoke checks against TanStack's API contract.

- **Keep** `src/features/board/{deemphasize,filter-issues,sort-column,use-change-indication,status-mapping}.test.ts` — pure helpers, unaffected.
- **Keep** `src/features/status-pill/transition-resolver.test.ts` — pure helper, still consumed by `StatusPillSelect.tsx`.
- **Keep** `src/features/mr-status/{ci-state,count-unresolved,reviewer-state}.test.ts` — pure helpers, unaffected.
- **Keep** `src/lib/use-polling.test.ts` — unaffected.

### Caller migration — net effect per file

| File | Before (LOC) | After (LOC) | Net change |
|---|---|---|---|
| `src/features/status-pill/use-transition-mutation.ts` | 82 | 0 (deleted) | −82 |
| `src/features/quick-create/use-create-issue-mutation.ts` | 75 | 0 (deleted) | −75 |
| `src/features/mr-status/use-mr-statuses.ts` | 73 | 0 (deleted, hooks moved) | −73 |
| `src/features/board/use-board-issues.ts` | 13 | 0 (deleted) | −13 |
| `src/features/ticket-detail/use-issue.ts` | 14 | 0 (deleted) | −14 |
| `src/features/status-pill/use-transitions.ts` | 14 | 0 (deleted) | −14 |
| `src/features/mr-status/MrSection.tsx` | 152 | ~120 (~30 LOC merged-MR handler gone) | −30 |
| `src/features/header/Header.tsx` | 86 | ~75 (refresh fan-out + ISSUE_QUERY_PREFIX gone) | −11 |
| `src/features/board/Board.tsx` | 254 | 254 (import path only) | 0 |
| `src/features/status-pill/StatusPillSelect.tsx` | (caller) | (caller, import path only) | ≈0 |
| `src/features/quick-create/QuickCreateForm.tsx` | (caller) | (caller, import path only) | ≈0 |
| `src/features/auth-status/AuthGate.tsx` | unchanged | unchanged | 0 |
| `src/features/header/GitlabIndicator.tsx` | unchanged | unchanged | 0 |
| `src/features/quick-create/use-my-epics.ts` | unchanged | unchanged | 0 |

New code lives in `src/dashboard/` (~6 files, projected ~500 LOC including types and tests). **Net effect: ~270 LOC of cross-feature plumbing converted into one testable, port-fronted module.**

## Acceptance criteria

- [ ] `DashboardCache` port and `TanstackDashboardCache` adapter live in separate files. The port file (`cache.ts`) does not import `@tanstack/react-query`.
- [ ] The four query-key tuples (`['jira', 'board', 'issues']`, `['jira', 'issue', key]`, `['jira', 'transitions', key]`, `['mr-statuses']`) and the `['jira', 'issue']` prefix appear in **exactly one file** (`src/dashboard/tanstack-cache.ts`). Grep across `src/features/` for any of those literal tuples or for `boardIssuesQueryKey` / `issueQueryKey` / `transitionsQueryKey` / `mrStatusesQueryKey` / `ISSUE_QUERY_PREFIX` returns zero matches.
- [ ] No file under `src/features/` imports from another `src/features/` module's `use-*` query/mutation files. (`MrSection.tsx` and `Board.tsx` may still import sibling `Column` types from `~/features/board/status-mapping`, etc. — that is unaffected.)
- [ ] `src/features/status-pill/use-transition-mutation.ts`, `src/features/quick-create/use-create-issue-mutation.ts`, `src/features/board/use-board-issues.ts`, `src/features/ticket-detail/use-issue.ts`, `src/features/status-pill/use-transitions.ts`, and `src/features/mr-status/use-mr-statuses.ts` are deleted.
- [ ] `src/features/mr-status/MrSection.tsx` does not import `useQueryClient`, `transitionsQueryKey`, `useTransitionMutation`, or `getTransitions`. The merged-MR click handler is one call to `useMrMergedAction()` plus one inline arrow.
- [ ] `src/features/header/Header.tsx` does not define a local `ISSUE_QUERY_PREFIX` and does not import `useQueryClient`, `boardIssuesQueryKey`, or `mrStatusesQueryKey`. `refresh` is sourced from `useRefreshAll()`.
- [ ] No file under `src/features/` declares a module-level `let` or `var` for state. (Greppable: `^let ` and `^var ` in `src/features/**/*.ts(x)` return zero matches.) The `unauthorizedToastShown` flag is dead.
- [ ] `src/dashboard/service.test.ts` exists, uses a hand-rolled fake `DashboardCache`, and contains no calls to `vi.mock`, no calls that stub `fetch`, no `new QueryClient(...)`, no JSX.
- [ ] The injected `clock`/`setTimeout`/`clearTimeout` in `DashboardServiceDeps` are exercised in the create-issue-timeout test with no real timer (asserted by a manually-pumpable promise + recorded `setTimeout` handle).
- [ ] All existing tests pass with no behavioural change. The "after a transition, both board and detail are rolled back when the server rejects" path is now covered by `service.test.ts`.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

None. Independent of #33 and #34, which are server-side. Lands cleanly on top of either order.

## Out of scope

- **Centralizing polling.** `usePolling` calls in `Board.tsx`, `IssueDetailPanel.tsx`, and the (new) `useMrStatuses` hook stay where they are. A provider-level ref-counted polling scheme was considered and rejected for this issue — it changes too many call sites for the marginal win, and per-hook polling is already factored cleanly via `~/lib/use-polling.ts`.
- **Eliminating `Board.tsx`'s `useMrStatuses()`-for-side-effect call.** That dependency is preserved (just routed through `~/dashboard` instead of `~/features/mr-status`). Removing it requires the service to drive MR pre-fetch from a board-ready signal — separate cleanup.
- **`AuthGate`'s `['jira', 'myself']` query, `GitlabIndicator`'s `['gitlab', 'user']` query, and `quick-create`'s `myEpicsQueryKey`.** None of them have cross-feature coupling today; folding them into the layer is mechanical busywork that doesn't reduce friction. They can move later additively.
- **Issue navigation (prev/next + keyboard handlers in `IssueDetailPanel.tsx`).** Surfaced as candidate #2 in the architecture exploration; depends on the same board-cache reads as this issue but is a separate refactor with its own shape (`useIssueNavigation(key)` hook). Track separately.
- **Notification layer (`notify` module replacing ad-hoc Sonner usage).** Surfaced as candidate #4. The `unauthorizedToastShown` singleton dies in this issue (its dedup state moves into `DashboardService`), but the broader pattern of consolidating toast vocabulary is separate.
- **ADF renderer pluggability.** Surfaced as candidate #5. Unrelated.
- **Promoting any of the hardcoded constants (`MERGED_TARGET_STATUS = 'In STG'`, `createIssueTimeoutMs = 10_000`, the staleTime values) to env vars.** Constants stay in the composition root; env promotion is a future one-line change if a real consumer appears.
- **Renaming hooks for the sake of renaming.** `useBoardIssues → useBoardData`, `useIssue → useTicket`, `useTransitionMutation → useTransitionAction`, `useCreateIssueMutation → useCreateAction` are the renames this issue introduces (they reflect the new layer's vocabulary). No further renaming.

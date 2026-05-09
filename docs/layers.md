# clashboard layers — one example per layer

Where [`docs/tour.md`](./tour.md) traces a single click through every layer, this doc presents _one example of each layer in isolation_. It is reference-style: open it when you want to answer "what does an application service look like?" by pointing at a single file.

The seven layers are the ones named in the [layer vocabulary](../CONTEXT-MAP.md#layer-vocabulary-shared-by-every-context) of `CONTEXT-MAP.md`. Each section gives the layer's name, the one-sentence definition, a real code excerpt from the migrated codebase, and a numbered list of what to notice. The closing section names what each layer must _not_ do, with a pointer to the `dependency-cruiser` rule that enforces the prohibition.

## 1. Domain

Pure functions over kernel types. No I/O, no time, no framework.

[`src/kernel/columns.ts`](../src/kernel/columns.ts):

```ts
export type Column = 'TO DO' | 'In Implementation' | 'In Code Review' | 'Done'

const COLUMN_TO_STATUSES: Record<Column, readonly string[]> = {
  'TO DO': ['Reviewed', 'Blocked'],
  'In Implementation': ['In Implementation'],
  'In Code Review': ['In Code Review'],
  Done: ['In STG', 'In QA', 'In UAT', 'Done'],
}

const STATUS_LOOKUP: ReadonlyMap<string, Column> = new Map(
  (Object.entries(COLUMN_TO_STATUSES) as [Column, readonly string[]][]).flatMap(
    ([column, statuses]) => statuses.map((status) => [normalizeStatus(status), column] as const),
  ),
)

export function columnForStatus(status: string): Column {
  return STATUS_LOOKUP.get(normalizeStatus(status)) ?? 'TO DO'
}
```

What to notice:

1. `columnForStatus` is a total function: every input string maps to a `Column`, and unknown statuses fall through to `'TO DO'` so cards never silently disappear.
2. There is no I/O, no `Date.now()`, no React. The only import is the sibling `normalizeStatus` — no kernel-external paths.
3. The matching test file [`src/kernel/columns.test.ts`](../src/kernel/columns.test.ts) is table-driven (`it.each([...])`), with a round-trip property test. No mocks, no fakes — pure call/assert.

## 2. Gateway

Port + adapter to an external system.

The port — what the application service sees — is a TypeScript interface in [`src/server/jira/gateway.ts`](../src/server/jira/gateway.ts):

```ts
export type JiraResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'unauthorized' }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'rejected'; message: string }

export interface JiraGateway {
  getMyself(): Promise<JiraResult<GatewayUser>>
  searchIssues(jql: string, fields: readonly string[]): Promise<JiraResult<RawSearchResponse>>
  getIssue(key: string, fields: readonly string[]): Promise<JiraResult<RawDetailedIssue>>
  getTransitions(key: string): Promise<JiraResult<GatewayTransition[]>>
  transitionIssue(key: string, transitionId: string): Promise<JiraResult<void>>
  createIssue(body: CreateIssueBody): Promise<JiraResult<GatewayCreatedIssue>>
}
```

The adapter — the only thing that knows about HTTP — is a factory in [`src/server/jira/http-gateway.ts`](../src/server/jira/http-gateway.ts):

```ts
export function createHttpJiraGateway(deps: Deps): JiraGateway {
  const fetchFn: FetchFn = deps.fetch ?? fetch
  const baseAuth = authHeader(deps.email, deps.apiToken)
  // ...
  return {
    transitionIssue(key, transitionId) {
      return call<void>(async () => {
        await request<void>(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, {
          method: 'POST',
          body: { transition: { id: transitionId } },
        })
      })
    },
    /* ...other methods... */
  }
}
```

What to notice:

1. The port is a plain TypeScript interface — no class, no inheritance. Application services depend on this shape; nothing else.
2. `JiraResult<T>` is a tagged union of success + named failure modes (`unauthorized`, `not-found`, `rejected`). Failures are values, not exceptions.
3. The adapter is a factory taking `Deps` (base URL, credentials, an injected `fetch`). HTTP-isms (`Buffer`, status codes, error parsing) live inside the adapter and never leak into the port.

## 3. Application service

Use-cases for one context. Orchestrates domain logic via gateway/cache ports. Framework-free factory.

[`src/contexts/board/application/board-application.ts`](../src/contexts/board/application/board-application.ts):

```ts
export function createBoardApplicationService(deps: BoardApplicationDeps): BoardApplicationService {
  return {
    loadBoard: () =>
      ResultAsync.fromPromise(
        deps.gateway.loadBoard(),
        (e): BoardLoadError =>
          new BoardNetworkError(e instanceof Error ? e.message : 'unknown error'),
      ).andThen((result) =>
        match(result)
          .with({ ok: true }, ({ baseUrl, issues }) =>
            okAsync<BoardSnapshot, BoardLoadError>({ baseUrl, issues }),
          )
          .with({ ok: false }, () =>
            errAsync<BoardSnapshot, BoardLoadError>(new BoardUnauthorized()),
          )
          .exhaustive(),
      ),
    refresh: () => deps.cache.invalidateBoard(),
  }
}
```

What to notice:

1. It is a factory taking `deps`: no globals, no module-level singletons. Adapters are chosen at the composition root.
2. The return type is `ResultAsync<T, E>` (neverthrow) with a hand-rolled tagged-error class for `E`. Errors are values that callers must match on.
3. The factory imports `BoardGateway` and `BoardCachePort` from a sibling [`ports.ts`](../src/contexts/board/application/ports.ts) — never the HTTP gateway or the TanStack Query cache. Tests construct it with a hand-rolled fake gateway from [`__fixtures__/`](../src/contexts/board/application/__fixtures__/), no `vi.mock`.

## 4. View-model

Framework-free state machine + derivation: `(state, event) → state` plus `(state, queryData, ...) → DisplayState`.

[`src/widgets/status-pill/view-model/status-pill-select-view-model.ts`](../src/widgets/status-pill/view-model/status-pill-select-view-model.ts):

```ts
import { match } from 'ts-pattern'

export type State = { open: false } | { open: true }
export type Event = { type: 'toggle' } | { type: 'close' }

export function reduce(state: State, event: Event): State {
  return match(event)
    .with({ type: 'toggle' }, () => ({ open: !state.open }) as State)
    .with({ type: 'close' }, () => ({ open: false }) as State)
    .exhaustive()
}

export type DisplayState = { open: false } | { open: true; dropdown: DropdownState }

export function derive(
  state: State,
  currentStatus: string,
  transitions: TransitionsView,
): DisplayState {
  if (!state.open) return { open: false }
  if (transitions.isPending) return { open: true, dropdown: { kind: 'loading' } }
  // ...maps the rest of the query shape to a DropdownState
}
```

What to notice:

1. Zero React imports. The reducer is `(state, event) → state`; the derivation is `(state, queryData, selection) → DisplayState`. Both are plain functions.
2. Every `match(...)` ends with `.exhaustive()`: adding a new event or a new dropdown kind becomes a compile error in every match site that handles it.
3. Tests are table-driven over the reducer and the derivation. There is no `renderHook`, no `WithDeps`, no fake hooks — the view-model is _the_ logic, and unit-testable as such.

## 5. Presenter

Thin React adapter binding the view-model to the framework.

[`src/widgets/status-pill/presenter/use-status-pill-select.ts`](../src/widgets/status-pill/presenter/use-status-pill-select.ts):

```ts
export function useStatusPillSelect(issueKey: string, currentStatus: string): StatusPillSelectApi {
  const [state, dispatch] = useReducer(reduce, initialState)
  const triggerRef = useRef<HTMLDivElement>(null)
  const transitions = useTransitions(issueKey, state.open)
  const mutation = useTransitionAction()

  useEffect(() => {
    if (!state.open) return
    const onPointerDown = (event: PointerEvent) => {
      /* close on outside click */
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [state.open])

  const display = derive(state, currentStatus, transitions)

  return {
    display,
    triggerRef,
    toggle: () => dispatch({ type: 'toggle' }),
    selectTransition: (transitionId, toStatusName) => {
      dispatch({ type: 'close' })
      mutation.mutate({ key: issueKey, transitionId, toStatusName })
    },
  }
}
```

What to notice:

1. This is the _only_ file in the status-pill widget that imports React, TanStack Query (via `useTransitions` / `useTransitionAction` from `~/coordinator`), or DOM listeners (`document.addEventListener`).
2. It feeds query data straight into the view-model's `derive(...)`. The presenter has no opinion about what `display` means — it just wires inputs together.
3. The shell is small on purpose: state lives in `useReducer(reduce, ...)`, the derivation is a pure function, and the only behaviour beyond binding is the `useEffect` for outside-click and Escape. Most of what would be "presenter logic" is already in the view-model.

## 6. View

React components.

[`src/widgets/status-pill/view/StatusPillSelect.tsx`](../src/widgets/status-pill/view/StatusPillSelect.tsx):

```tsx
const { display, triggerRef, toggle, selectTransition } = useStatusPillSelect(issueKey, status)

return (
  <div ref={triggerRef} className="relative inline-block" onClick={stopBubble}>
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        toggle()
      }}
      aria-haspopup="menu"
      aria-expanded={display.open}
      aria-label={`Change status from ${status}`}
    >
      <StatusPill status={status} />
    </button>
    {display.open && (
      <div role="menu" className="...">
        <DropdownContents dropdown={display.dropdown} onSelect={selectTransition} />
      </div>
    )}
  </div>
)
```

What to notice:

1. The view composes; it does not decide. `display`, `toggle`, and `selectTransition` are handed in by the presenter — the component itself owns no state and runs no effects.
2. Imports go to `../presenter`, sibling view files (`StatusPill`, `StatusIcon`), and design-system primitives (`cn`, `lucide-react`). There is no path through this file to `~/server`, `~/coordinator`, or another context.
3. There are no unit tests for the view. Behaviour is covered end-to-end via the Playwright harness; the view-model and presenter cover the logic.

## 7. Coordinator

Cross-context workflows.

[`src/coordinator/coordinator.ts`](../src/coordinator/coordinator.ts) — `applyTransition`:

```ts
async function runApplyTransition(
  input: ApplyTransitionInput,
): Promise<Result<void, ApplyTransitionError>> {
  const { key, transitionId, toStatusName } = input
  await Promise.all([cache.cancelBoard(), cache.cancelIssue(key)])
  const rollbackBoard = cache.patchBoard((prev) => /* optimistic patch */)
  const rollbackIssue = cache.patchIssue(key, (prev) => /* optimistic patch */)

  let result: TransitionIssueResult
  try {
    result = await jira.transitionIssue({ data: { key, transitionId } })
  } catch (e) {
    rollbackBoard(); rollbackIssue()
    toast.error(`Couldn't change status: ${...}`)
    return err(new TransitionNetworkError(...))
  }

  return match(result)
    .with({ ok: true }, () => { cache.invalidateIssue(key); return ok(undefined) })
    .with({ ok: false, reason: 'rejected' }, ({ message }) => { rollbackBoard(); rollbackIssue(); toast.error(message); return err(new TransitionRejected(message)) })
    .with({ ok: false, reason: 'unauthorized' }, ({ message }) => { rollbackBoard(); rollbackIssue(); toast.error(message); return err(new TransitionUnauthorized(message)) })
    .exhaustive()
}
```

What to notice:

1. The coordinator is a factory taking `CoordinatorDeps` — `cache`, `toast`, `navigate`, `browser`, `clock`, `jira` server-functions. All side effects arrive through ports declared in [`src/coordinator/ports.ts`](../src/coordinator/ports.ts).
2. It orchestrates _across_ contexts: one optimistic patch into Board's cache, one into Detail's, one network call, then commit-or-rollback both. No single context owns this workflow.
3. The factory is framework-free. React-bound adapters (TanStack Query cache, sonner toast, router navigate) live in [`src/coordinator/adapters/`](../src/coordinator/adapters/) and are wired in `provider.tsx`. Tests construct the coordinator with hand-rolled fakes for each port.

## Anti-patterns — what each layer must _not_ do

Each prohibition is enforced by a `dependency-cruiser` rule in [`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs).

- **Domain** must not import anything outside `~/kernel` and its own peers, and must not import React. Rules: `board-domain-only-imports-kernel`, `detail-domain-only-imports-kernel`, `capture-domain-only-imports-kernel`, `no-react-in-domain-application-view-model`.
- **Gateway** ports must be the only gateway surface visible to consumers; the application layer is forbidden from reaching outside the context to grab an adapter directly. Rule: `<context>-application-only-imports-kernel-and-self` (e.g. `board-application-only-imports-kernel-and-self`).
- **Application service** must not import React, TanStack Query, or sonner; must not depend on another context; must not see coordinator adapters. Rules: `no-react-in-domain-application-view-model`, `no-tanstack-query-outside-presenter`, `no-cross-context`, `context-inner-layers-cant-import-coordinator-adapters-or-provider`.
- **View-model** must not import React or TanStack Query; in widgets it is also held to the no-query-outside-presenter rule. Rules: `no-react-in-domain-application-view-model`, `no-tanstack-query-outside-presenter`, `no-tanstack-query-in-widgets-outside-presenter`, `<context>-view-model-only-imports-kernel-and-domain`.
- **Presenter** must not import test-only fakes from `__fixtures__/`. Rule: `production-cant-import-fixtures`.
- **View** in a widget must not depend on a bounded context; nothing in `src/` may import the deleted `src/features/`. Rules: `widgets-stay-out-of-contexts`, `no-features-folder`.
- **Coordinator** must not reach into a context's view, presenter, or view-model; React / TanStack / sonner are confined to `coordinator/adapters/`, `provider.tsx`, and `hooks.ts`. Rules: `coordinator-cant-see-context-views`, `coordinator-effects-only-in-adapters`, `kernel-cant-import-app-code` (the kernel is never an escape hatch).

If you change a layer and a dependency-cruiser rule fires, the rule name in the error matches a name in the list above. Look up its `comment:` field in `.dependency-cruiser.cjs` for the one-sentence rationale.

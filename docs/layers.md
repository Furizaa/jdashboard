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

On the **client**, each context owns the port shape its application service depends on. The Board context's port lives in [`src/contexts/board/application/ports.ts`](../src/contexts/board/application/ports.ts):

```ts
import type { SearchIssuesResult } from '~/kernel'

export interface BoardGateway {
  loadBoard(): Promise<SearchIssuesResult>
}

export interface BoardCachePort {
  invalidateBoard(): void
}
```

`SearchIssuesResult` is the wire shape from the server: `{ ok: true, baseUrl, issues } | { ok: false, error: { _tag: 'Unauthorized' } }` (see [ADR 0004](./adr/0004-neverthrow-client-effect-server.md)). The application service unwraps this tagged JSON into `ResultAsync<BoardSnapshot, BoardLoadError>` (section 3).

There is no client-side HTTP adapter because the network call is handled by TanStack Start server functions; the only adapters in production are the server functions themselves (see sections 8–13 below for the server side of the same call). The test adapter — a hand-rolled fake — lives in [`src/contexts/board/application/__fixtures__/fake-gateway.ts`](../src/contexts/board/application/__fixtures__/fake-gateway.ts) and matches the same `BoardGateway` shape.

What to notice:

1. The port is a plain TypeScript interface — no class, no inheritance. Application services depend on this shape; nothing else.
2. The port is **per-context**: `BoardGateway` exposes only `loadBoard`, narrowed to what Board needs. Other contexts (`detail`, `capture`) declare their own narrowed ports. Per [ADR 0005](./adr/0005-effect-server-architecture.md), the server diverges and uses one shared port per gateway.
3. The wire-shape tagged union (`SearchIssuesResult` from `~/kernel`) is what the client unwraps via neverthrow + ts-pattern. Failures are values, not exceptions.

The fuller Port + Adapter example — with both a port (`Context.Tag`) and an HTTP adapter (`Layer`) implementing it — lives on the server side: see sections 9 (Gateway port) and 10 (Gateway adapter) below.

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

## Server layers

Sections 1–7 cover the client. The server has its own six-layer vocabulary, summarised in [`CONTEXT-MAP.md`'s "Server architecture (Effect-TS pass)" section](../CONTEXT-MAP.md#server-architecture-effect-ts-pass) and motivated in [ADR 0005](./adr/0005-effect-server-architecture.md). One annotated example for each layer follows. The server has no view-model, presenter, view, or coordinator layer — those are client-side; cross-context composition for reads happens at the server-function layer (the route equivalent on the client).

### 8. Domain (server)

Pure functions over gateway-output types and primitives. No I/O, no time, no `effect` imports beyond trivial `Schema` for cases where the wire shape itself is the type.

[`src/server/gateways/gitlab/mr/review-state.ts`](../src/server/gateways/gitlab/mr/review-state.ts):

```ts
export type MyReviewerState =
  | 'unreviewed'
  | 'review_started'
  | 'reviewed'
  | 'requested_changes'
  | 'approved'

export type MrState = 'opened' | 'merged' | 'closed'

export type ReviewBucket = 'needs-review' | 'rejected' | 'accepted' | 'drop'

export function reviewBucket(myReviewerState: MyReviewerState, mrState: MrState): ReviewBucket {
  if (mrState === 'closed') return 'drop'
  if (mrState === 'merged') return 'accepted'
  if (myReviewerState === 'requested_changes') return 'rejected'
  if (myReviewerState === 'approved') return 'accepted'
  return 'needs-review'
}
```

What to notice:

1. No imports at all. The file contains only domain types and a total function — no `effect`, no `@effect/platform`, no `Schema`, no I/O surface.
2. `reviewBucket` is total: every `(MyReviewerState, MrState)` pair maps to a `ReviewBucket`. Tests are table-driven `(input, input) → expected` — nothing to mock.
3. Co-located under the gateway folder (`gateways/gitlab/mr/`) because its inputs are GitLab-shaped values. Per [ADR 0005](./adr/0005-effect-server-architecture.md), cross-context types live with the gateway that produces them; there is no `server/kernel/`.

### 9. Gateway port

`Context.Tag` + interface. The port is what application services see; the adapter is the only thing that knows how to talk to the external system.

[`src/server/gateways/jira/port.ts`](../src/server/gateways/jira/port.ts):

```ts
import { Context, type Effect } from 'effect'

export type JiraGatewayShape = {
  readonly getMyself: () => Effect.Effect<JiraUser, JiraGatewayError>
  readonly searchIssues: (
    jql: string,
    fields: readonly string[],
  ) => Effect.Effect<RawSearchResponse, JiraGatewayError>
  readonly getIssue: (
    key: string,
    fields: readonly string[],
  ) => Effect.Effect<RawDetailedIssue, JiraGatewayError>
  readonly getTransitions: (key: string) => Effect.Effect<AllowedTransition[], JiraGatewayError>
  readonly transitionIssue: (
    key: string,
    transitionId: string,
  ) => Effect.Effect<void, JiraGatewayError>
  readonly createIssue: (
    body: CreateIssueBody,
  ) => Effect.Effect<GatewayCreatedIssue, JiraGatewayError>
}

export class JiraGateway extends Context.Tag('JiraGateway')<JiraGateway, JiraGatewayShape>() {}
```

What to notice:

1. The Tag pattern — `class JiraGateway extends Context.Tag('JiraGateway')<JiraGateway, JiraGatewayShape>() {}` — declares a service identifier in Effect's `Context`. The string is its runtime key; the second type parameter is its surface. Consumers `yield* JiraGateway` and receive a `JiraGatewayShape`.
2. Every method returns `Effect<A, E>` — never `Promise<A>`, never throwing. Failures are part of the type (`JiraGatewayError = JiraUnauthorized | JiraNotFound | JiraRejected`); thrown exceptions are not part of the contract. Class names are gateway-prefixed so Jira and GitLab errors can co-exist in one file; the wire `_tag` strings stay un-prefixed (`'Unauthorized'`, `'NotFound'`, `'Rejected'`) because clients discriminate by gateway via the response envelope, not the tag string.
3. **One gateway, all methods.** Per [ADR 0005](./adr/0005-effect-server-architecture.md), the server uses a shared port rather than the client's per-context-view rule, because Jira's methods are atomic I/O operations with identical signatures across consumers.

### 10. Gateway adapter

`Layer.effect(Tag, ...)` using `@effect/platform`'s `HttpClient`. The only place that knows the wire format of the external system.

[`src/server/gateways/jira/http-adapter.ts`](../src/server/gateways/jira/http-adapter.ts) — the `searchIssues` method and the shared `executeJson` helper:

```ts
export const JiraGatewayLive: Layer.Layer<JiraGateway, never, HttpClient.HttpClient | ServerEnv> =
  Layer.effect(
    JiraGateway,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const env = yield* ServerEnv
      // ...auth + helper builders (get, postJson, executeJson)...

      return JiraGateway.of({
        searchIssues: (jql, fields) =>
          postJson('/rest/api/3/search/jql', { jql, fields, maxResults: 100 }).pipe(
            Effect.flatMap((req) => executeJson<RawSearchResponse>(req)),
          ),
        /* ...other methods... */
      })
    }),
  )

const executeJson = <T>(
  request: HttpClientRequest.HttpClientRequest,
): Effect.Effect<T, JiraGatewayError> =>
  client.execute(request).pipe(
    Effect.mapError(
      (error) => new JiraRejected({ message: `Jira request failed: ${error.message}` }),
    ),
    Effect.flatMap((response) =>
      HttpClientResponse.matchStatus(response, {
        '2xx': (ok) => decodeJsonBody<T>(ok),
        401: () => Effect.fail(new JiraUnauthorized()),
        404: () => Effect.fail(new JiraNotFound()),
        orElse: (bad) => failFromStatus(bad),
      }),
    ),
  )
```

What to notice:

1. `client.execute(request)` is the only HTTP call. The `HttpClient` instance comes from the `R` channel — `Layer.effect(JiraGateway, ...)` declares it requires `HttpClient.HttpClient | ServerEnv`. Retry+timeout middleware lives in the `HttpClient` Layer one level up ([`src/server/runtime/app-layer.ts`](../src/server/runtime/app-layer.ts)), so every method here inherits it automatically.
2. `HttpClientResponse.matchStatus` collapses HTTP-level branches into one expression. Each status arm produces an `Effect<T, JiraGatewayError>` — `Effect.fail(new JiraUnauthorized())` for 401, `Effect.fail(new JiraNotFound())` for 404, body-parse + `JiraRejected` for everything else. Failures are values, not throws.
3. The adapter is a `Layer`, not a factory function. `JiraGatewayLive` is what `appRuntime` consumes; tests substitute `Layer.succeed(JiraGateway, fakeShape)` to swap in a hand-rolled fake without touching the application service.

### 11. Application service (server)

One file per use-case, exporting `Effect<A, E, R>`. The `R` channel lists the gateway Tags + config Tags it depends on.

[`src/server/contexts/board/application/load-board.ts`](../src/server/contexts/board/application/load-board.ts):

```ts
export const loadBoard: Effect.Effect<LoadBoardOk, JiraUnauthorized, JiraGateway | BoardConfig> =
  Effect.gen(function* () {
    const jira = yield* JiraGateway
    const config = yield* BoardConfig
    const jql = buildBoardJql({
      projectKey: config.projectKey,
      label: config.labelFilter,
      doneWindowDays: config.doneWindowDays,
    })
    const response = yield* jira.searchIssues(jql, BOARD_FIELDS).pipe(
      Effect.catchTags({
        NotFound: (e) => Effect.die(e),
        Rejected: (e) => Effect.die(e),
      }),
    )
    const hideSet = new Set(config.hideLabels.map((l) => l.toLowerCase()))
    const issues = response.issues.map((issue) => toBoardIssue(issue, hideSet))
    return { baseUrl: config.baseUrl, issues }
  })
```

What to notice:

1. The **`R` channel** — `JiraGateway | BoardConfig` — is the use-case's public requirements declaration. Anyone importing `loadBoard` sees, at the type level, exactly which Tags must be in scope before it can run. The handler discharges `BoardConfig` with `Effect.provide(BoardConfigLive)`; `appRuntime` discharges `JiraGateway` and the rest of the cross-cutting layers.
2. The `E` channel — `JiraUnauthorized` — names the failures `loadBoard` exposes to its caller. The gateway exposes three tags; this use-case re-classifies `NotFound` and `Rejected` as defects via `Effect.die` because they are not expected in the search-by-JQL flow. Tagged short-circuit: failures in the `E` channel are values to handle; defects bypass the wire mapper and become `InternalError`. (`Effect.catchTags` matches against the wire `_tag`, so the keys are `NotFound` / `Rejected` even though the class names are gateway-prefixed.)
3. `Effect.gen` reads like async/await: `yield* JiraGateway` resolves the Tag, `yield* jira.searchIssues(...)` runs the Effect and binds its success value. The function is pure data — nothing executes until `appRuntime.runPromise(...)` fires it. Tests use `@effect/vitest`'s `it.effect(...)` with a `Layer.succeed(JiraGateway, fake)` to drive the Effect directly, no `vi.mock`.

### 12. Wire boundary mapper

`toWire(program, errorSchema)` — the only place Effect values become JSON.

[`src/server/wire/to-wire.ts`](../src/server/wire/to-wire.ts):

```ts
export const toWire = <A extends object, E, IE extends TaggedErrorPayload, R>(
  program: Effect.Effect<A, E, R>,
  errorSchema: Schema.Schema<E, IE, never>,
): Effect.Effect<WireResult<A, IE | InternalErrorPayload>, never, R> => {
  const encodeError = Schema.encodeUnknownSync(errorSchema)
  return program.pipe(
    Effect.match({
      onSuccess: (value) => ({ ok: true, ...value }),
      onFailure: (error) => ({ ok: false, error: encodeError(error) }),
    }),
    Effect.catchAllDefect((defect) =>
      Effect.sync(() => {
        console.error('[toWire] Unhandled defect:', defect)
        return { ok: false, error: { _tag: 'InternalError' } }
      }),
    ),
  )
}
```

What to notice:

1. **Success is pass-through** — `{ ok: true, ...value }` — because today's success types are JSON-flat per [ADR 0005](./adr/0005-effect-server-architecture.md). The upgrade to `Schema`-encoded success lands when types get richer (e.g. `Date` values in a future `code-health` context).
2. **Failure runs `Schema.encodeUnknownSync(errorSchema)`** to produce `{ _tag, ...payload }`. Each handler passes its **per-context** error schema (e.g. `LoadBoardError = Schema.Union(JiraUnauthorized)`); adding a new tag to the union surfaces here as a compile error. The wire codec is generated from the schema, not hand-written.
3. **`Effect.catchAllDefect`** is the failure-vs-defect distinction in code: tagged failures travel the `E` channel and round-trip cleanly; unexpected defects (escaping exceptions, OOMs) bypass the schema and become `{ _tag: 'InternalError' }`. The signature returns `Effect<WireResult<A>, never, R>` — after `toWire`, the error channel is empty and `runPromise` cannot reject for application reasons.

### 13. Server-function handler

`createServerFn(...).handler(() => appRuntime.runPromise(toWire(...)))`. The composition root for one request — the server's coordinator equivalent for cross-context reads.

[`src/server/server-functions/board.ts`](../src/server/server-functions/board.ts):

```ts
const boardProgram = loadBoard.pipe(Effect.provide(BoardConfigLive))

export const searchIssues = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SearchIssuesResult> => {
    const wire = await appRuntime.runPromise(toWire(boardProgram, LoadBoardError))
    if (!wire.ok && wire.error._tag === 'InternalError') {
      throw new Error('searchIssues: internal error')
    }
    return wire as SearchIssuesResult
  },
)
```

What to notice:

1. The handler is a thin shell. Only three things change between handlers: the **program** (`loadBoard`), the **per-context Layer** provided into it (`BoardConfigLive`), and the **error schema** (`LoadBoardError`). The runtime, the wire mapper, and the gateway adapter are constant.
2. Two-level injection: `Effect.provide(BoardConfigLive)` discharges this context's config Tag at the handler; `appRuntime` discharges the cross-cutting Tags (`JiraGateway`, `ServerEnv`, `HttpClient`). This is what lets every handler share one process-scoped runtime without coupling on each other's config.
3. The `if (!wire.ok && wire.error._tag === 'InternalError')` arm demotes defects to a server-function failure so TanStack Query's `isError` flips on the client. Tagged failures (`Unauthorized`) stay in the wire payload and are unwrapped by `ts-pattern` on the other side, per [ADR 0004](./adr/0004-neverthrow-client-effect-server.md).

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

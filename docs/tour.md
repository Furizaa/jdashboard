# clashboard tour: one click, end to end

This is the manga's first chapter. We follow a single user action — clicking the status pill on a card and picking a new status — through every layer of clashboard's architecture: view, presenter, view-model, coordinator, cache port, gateway, and back. By the end you should be able to open the codebase cold and know where everything lives, why each layer exists, and which dependency-law edges the action travels along.

The action is small but exercises every layer the [context map](../CONTEXT-MAP.md) names: the widget (status pill) calls a coordinator action, the coordinator orchestrates two contexts (Board + Detail) by patching their caches optimistically, the network call goes through a TanStack Start server function to a Jira HTTP gateway, and the result either commits the optimistic patch or rolls it back with a toast. Each section below names one layer, shows ~10 lines of real code, and ends with **what to notice** — the architectural invariant that excerpt makes concrete.

## 1. The click — the view

The view is the surface the user touches. It composes design-system primitives and forwards events; it never owns business logic. The pill's clickable shell lives in [`src/widgets/status-pill/view/StatusPillSelect.tsx`](../src/widgets/status-pill/view/StatusPillSelect.tsx).

```tsx
// src/widgets/status-pill/view/StatusPillSelect.tsx (excerpt)
const { display, triggerRef, toggle, selectTransition } = useStatusPillSelect(issueKey, status)

return (
  <div ref={triggerRef} className="relative inline-block" onClick={stopBubble}>
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); toggle() }}
      aria-haspopup="menu"
      aria-expanded={display.open}
      aria-label={`Change status from ${status}`}
    >
      <StatusPill status={status} />
    </button>
```

**What to notice:**

- The view holds zero knowledge of TanStack Query, Jira, transitions, or caches. It calls `toggle()` and `selectTransition()` — both functions handed to it by the presenter.
- The component file imports `useStatusPillSelect` from `../presenter` and `StatusPill` / `StatusIcon` from sibling view files. There is no path through this file to `~/server` or `~/coordinator`.
- The file lives in `widgets/`, not `contexts/`: the status pill is a reusable visual surface, not a bounded context. Both the Board cards and the Detail panel reuse it.

## 2. The presenter — the React-bound shell

The presenter is the only layer in this trace allowed to import React, TanStack Query, or DOM listeners. It owns subscription, effects, and event-handler glue; it produces no business logic of its own. See [`src/widgets/status-pill/presenter/use-status-pill-select.ts`](../src/widgets/status-pill/presenter/use-status-pill-select.ts).

```ts
const [state, dispatch] = useReducer(reduce, initialState)
const triggerRef = useRef<HTMLDivElement>(null)
const transitions = useTransitions(issueKey, state.open) // (1)
const mutation = useTransitionAction() // (2)
const display = derive(state, currentStatus, transitions)

return {
  display,
  triggerRef,
  toggle: () => dispatch({ type: 'toggle' }),
  selectTransition: (transitionId, toStatusName) => {
    dispatch({ type: 'close' })
    mutation.mutate({ key: issueKey, transitionId, toStatusName }) // (3)
  },
}
```

**What to notice:**

- `(1)` and `(2)` are the only TanStack-Query touches in the trace, and both go through coordinator hooks — never `useQuery` directly. Every layer below is framework-free.
- `display` is computed by passing the reducer state and the query result into a pure `derive(...)` call. The presenter doesn't know what `display` _means_; the view-model does.
- `(3)` is where the click leaves the widget. `selectTransition` dispatches a local `close` event and then fires the coordinator action — the seam where local React state meets cross-context workflows.

## 3. The view-model — the framework-free state machine

The view-model is plain TypeScript: a reducer plus a derivation function. No React. No TanStack Query. No DOM. It is unit-testable as ordinary functions (no `renderHook`, no fakes). See [`src/widgets/status-pill/view-model/status-pill-select-view-model.ts`](../src/widgets/status-pill/view-model/status-pill-select-view-model.ts).

```ts
// src/widgets/status-pill/view-model/status-pill-select-view-model.ts (excerpt)
import { match } from 'ts-pattern'

export type State = { open: false } | { open: true }
export const initialState: State = { open: false }

export type Event = { type: 'toggle' } | { type: 'close' }

export function reduce(state: State, event: Event): State {
  return match(event)
    .with({ type: 'toggle' }, () => ({ open: !state.open }) as State)
    .with({ type: 'close' }, () => ({ open: false }) as State)
    .exhaustive()
}
```

**What to notice:**

- The import line shows zero React, zero TanStack, zero `sonner`. The only dependency is `ts-pattern` and a kernel type (`GetTransitionsResult`, used further down in `derive`).
- `match(...).exhaustive()` is the spine. Adding a new event variant becomes a compile error here _and_ at every other call site that matches over events — exhaustiveness is the architectural gate ([ADR 0002](./adr/0002-bounded-contexts-and-layer-vocabulary.md), [ADR 0003](./adr/0003-framework-free-view-models.md)).
- Tests live next to the file and exercise `(state, event) → state'` and `(state, queryData) → DisplayState` directly — no `renderHook`, no mock boundaries.

## 4. The coordinator — cross-context orchestration

`mutation.mutate` reaches the coordinator's `applyTransition` workflow via the `useTransitionAction` hook in `src/coordinator/hooks.ts`. Inside the coordinator, we leave React behind for good. The coordinator is a framework-free factory that takes ports and orchestrates workflows that span more than one context. See [`src/coordinator/coordinator.ts`](../src/coordinator/coordinator.ts).

```ts
// src/coordinator/coordinator.ts (excerpt)
async function runApplyTransition(
  input: ApplyTransitionInput,
): Promise<Result<void, ApplyTransitionError>> {
  const { key, transitionId, toStatusName } = input

  await Promise.all([cache.cancelBoard(), cache.cancelIssue(key)])

  const rollbackBoard = cache.patchBoard((prev) => /* … patch board cache … */)
  const rollbackIssue = cache.patchIssue(key, (prev) => /* … patch issue cache … */)

  let result: TransitionIssueResult
  try {
    result = await jira.transitionIssue({ data: { key, transitionId } })
```

**What to notice:**

- The signature returns `ResultAsync<void, ApplyTransitionError>` — a `neverthrow` type whose error channel is a hand-rolled tagged union (`TransitionRejected | TransitionUnauthorized | TransitionNetworkError`). The wire format and the architecture share the same shape ([ADR 0004](./adr/0004-neverthrow-client-effect-server.md)).
- The coordinator depends on _ports_, not adapters: `cache`, `toast`, `jira.transitionIssue`. The `CoordinatorProvider` wires real adapters in at the React boundary; tests wire fakes.
- This is the only layer that touches both Board and Detail in one call (`cancelBoard` + `cancelIssue`, `patchBoard` + `patchIssue`). Cross-context choreography lives here, not in either context.

## 5. The optimistic patches — the Cache port

The coordinator does not import TanStack Query. It calls a `Cache` port whose methods are shaped per-context: `patchBoard`, `patchIssue`, `cancelBoard`, `cancelIssue`, `invalidateIssue`, `invalidateTransitions`. See [`src/coordinator/ports.ts`](../src/coordinator/ports.ts).

```ts
// src/coordinator/ports.ts (excerpt)
export type Patch<T> = (prev: T | undefined) => T | undefined
export type Rollback = () => void

export interface Cache {
  readBoard(): SearchIssuesResult | undefined
  readIssue(key: string): GetIssueResult | undefined
  // …
  patchBoard(patch: Patch<SearchIssuesResult>): Rollback
  patchIssue(key: string, patch: Patch<GetIssueResult>): Rollback
  cancelBoard(): Promise<void>
  cancelIssue(key: string): Promise<void>
  invalidateIssue(key: string): void
  invalidateTransitions(key: string): void
}
```

The TanStack Query implementation lives behind that port in [`src/coordinator/adapters/tanstack-cache.ts`](../src/coordinator/adapters/tanstack-cache.ts) — it is the _only_ file outside `presenter/` allowed to know that we use TanStack Query at all.

**What to notice:**

- The port shape is per-context (`patchBoard`, `patchIssue`) even though one adapter implements it. The coordinator gets per-context cache abstractions through method names, not through reaching into `contexts/board/application` or `contexts/detail/application`.
- `patchBoard` returns a `Rollback`. The coordinator captures both rollback closures up front, then either commits (by invalidating after the network call succeeds) or replays them on failure.
- Each context's own application service (e.g. [`board-application.ts`](../src/contexts/board/application/board-application.ts), [`detail-application.ts`](../src/contexts/detail/application/detail-application.ts)) owns its own gateway and a cache port for its _own_ load + refresh use cases. Cross-context optimistic mutation is the coordinator's job, not a single context's.

## 6. The gateway call — the network boundary

`jira.transitionIssue` is wired to a TanStack Start server function. From the client's point of view it is a normal async function returning a tagged union; under the hood, TanStack Start serialises the call across the network boundary into the Effect server. See [`src/server/server-functions/detail.ts`](../src/server/server-functions/detail.ts) and [`src/server/gateways/jira/http-adapter.ts`](../src/server/gateways/jira/http-adapter.ts).

```ts
// src/server/server-functions/detail.ts (excerpt)
export const transitionIssue = createServerFn({ method: 'POST' })
  .inputValidator((data: { key: string; transitionId: string }) => ({
    key: requireKey('transitionIssue', data?.key),
    transitionId: requireKey('transitionIssue (transitionId)', data?.transitionId),
  }))
  .handler(async ({ data }): Promise<TransitionIssueResult> => {
    const wire = await appRuntime.runPromise(
      toWire(performTransition(data.key, data.transitionId), PerformTransitionError),
    )
    if (!wire.ok && wire.error._tag === 'InternalError') {
      throw new Error('transitionIssue: internal error')
    }
    return wire as TransitionIssueResult
  })
```

```ts
// src/server/gateways/jira/http-adapter.ts (excerpt)
transitionIssue: (key, transitionId) =>
  postJson(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, {
    transition: { id: transitionId },
  }).pipe(Effect.flatMap((req) => executeNoBody(req))),
```

**What to notice:**

- The handler is a thin shell: pick a program (`performTransition(...)`), pick its error schema (`PerformTransitionError`), hand both to `toWire`, run on the process-scoped `appRuntime`. Section 10 of this tour walks the same skeleton end-to-end for `searchIssues`.
- `toWire` produces tagged JSON: `{ ok: true }` on success, `{ ok: false, error: { _tag: 'Unauthorized' | 'Rejected', message? } }` on tagged failure, `{ ok: false, error: { _tag: 'InternalError' } }` on defect. The handler demotes `InternalError` to a thrown error so TanStack Query's `isError` flag flips on the client; tagged failures stay in the wire payload and are unwrapped by `ts-pattern` ([ADR 0004](./adr/0004-neverthrow-client-effect-server.md)).
- The wire is plain JSON. That is the bridge between client `neverthrow` and server `Effect`: nothing about the wire shape forces both sides to use the same library. The HTTP adapter is the only place in the codebase where Jira's REST URLs appear; the port lives in [`src/server/gateways/jira/port.ts`](../src/server/gateways/jira/port.ts) (see section 10.4 for the Tag pattern).

## 7. The result — commit or rollback

Control returns to the coordinator. The result is a tagged `TransitionIssueResult`; ts-pattern matches it exhaustively and the coordinator either commits the optimistic patch (by invalidating the affected query keys) or replays the rollback closures and toasts the user.

```ts
return match(result)
  .with({ ok: true }, () => {
    cache.invalidateIssue(key)
    cache.invalidateTransitions(key)
    return ok(undefined)
  })
  .with({ ok: false, error: { _tag: 'Rejected' } }, ({ error }) => {
    rollbackBoard()
    rollbackIssue()
    toast.error(error.message)
    return err(new TransitionRejected(error.message))
  })
  .exhaustive() // … plus an `Unauthorized` branch with the same shape
```

**What to notice:**

- The toast is a port. The coordinator calls `toast.error(message)`; behind the port, `createSonnerToastAdapter` calls `sonner`'s `toast.error`. View-models and contexts never import `sonner`.
- The success branch invalidates two query keys: the issue (so the panel refetches its full payload) and the transitions for that issue (so the dropdown reflects the new status's allowed next steps). The board is not invalidated — the optimistic patch is the source of truth until the next poll.
- Adding a new failure tag (e.g. `'RateLimited'`) becomes a compile error here. ts-pattern's `.exhaustive()` is how the architecture earns the "errors as values" claim. The match keys are the wire `_tag` literals encoded by `Schema.encodeUnknownSync` on the server (see section 10.6).

## 8. The re-derive — the round trip closes

After invalidation, TanStack Query refetches the affected queries. New data arrives, the presenter's `useTransitions(issueKey, ...)` and the parent `useTicket(issueKey)` (in Detail) and `useBoardData()` (in Board) all see fresh values. Each presenter feeds the new `data` back into its view-model's derivation, which produces a new `DisplayState`, which the view re-renders.

```ts
// src/widgets/status-pill/view-model/status-pill-select-view-model.ts (excerpt)
export function derive(
  state: State,
  currentStatus: string,
  transitions: TransitionsView,
): DisplayState {
  if (!state.open) return { open: false }
  if (transitions.isPending) return { open: true, dropdown: { kind: 'loading' } }
  if (transitions.isError || transitions.data === undefined)
    return { open: true, dropdown: { kind: 'error-network' } }
```

**What to notice:**

- `derive` is pure. It receives the new `currentStatus` (from the parent component, which got it from the freshly-cached `BoardIssue`) and the new `transitions` payload as plain values. It returns a plain `DisplayState`. The view re-renders because React notices the new return value, not because anything in the view-model knows React exists.
- The same shape repeats in the Detail context's [`use-issue-panel.ts`](../src/contexts/detail/presenter/use-issue-panel.ts): query data flows in, `derive(...)` produces an `IssuePanelState`, the view re-renders. Two contexts, one pattern.
- The round trip is over. Status changed in Jira; status changed on the board; status changed in the panel header. Three surfaces, one click, one coordinator action.

## 9. The whole picture

Below is the dependency graph as enforced by `dependency-cruiser`. The path the action travels — view → presenter → view-model → coordinator → port → gateway, and back — is one walk through this DAG. Every edge it crosses is one of the allowed edges named in [ADR 0002](./adr/0002-bounded-contexts-and-layer-vocabulary.md).

![clashboard architecture diagram (auto-generated by dependency-cruiser at every milestone)](./architecture.svg)

**What to notice:**

- The graph is a tree, not a mesh. There is no edge from `widgets/status-pill` into any `contexts/<name>/`. There is no edge from the coordinator into `contexts/<name>/{view, presenter, view-model}`. There is no edge from `contexts/A` into `contexts/B`.
- The lockdown slice ([slice 58](../.agents/issues/58-arch-lockdown.md)) made every dependency-cruiser rule an `error`. The diagram above is what passing CI looks like; any future drift becomes a CI failure with a named rule attached.
- The action's path enters from the top (`routes` / `widgets`), descends through the widget's three layers, jumps sideways into `coordinator`, drops to `coordinator/ports`, exits into `server`, and returns. Nothing reaches sideways or upward.

## 10. Server side: from handler to gateway and back

Sections 1–9 followed the click as far as the wire boundary and stopped at the moment the JSON shape comes back. This chapter starts on the other end. The server is its own architecture — a small one — and it deserves its own walk: a fresh request lands on a TanStack Start handler, threads through every server layer, and returns the same `{ ok, ... }` shape the client unwraps via neverthrow + ts-pattern.

We pick `searchIssues` (the Board's `loadBoard` handler) because it's the simplest end-to-end vertical slice on the server: one gateway, one use-case, one wire mapping, no cross-system orchestration. Every other handler reuses the same skeleton. The Effect-TS server layout this trace walks through is described in [`CONTEXT-MAP.md`'s "Server architecture (Effect-TS pass)" section](../CONTEXT-MAP.md#server-architecture-effect-ts-pass) and [ADR 0005](./adr/0005-effect-server-architecture.md).

### 10.1. The entry — server-function handler

A TanStack Start server function in [`src/server/server-functions/board.ts`](../src/server/server-functions/board.ts) is the composition root for one request. It is intentionally a thin shell: pick a program, pick its error schema, hand both to `toWire`, run.

```ts
// src/server/server-functions/board.ts (excerpt)
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

**What to notice:**

- The handler's only Effect-aware call is `appRuntime.runPromise(toWire(...))`. Everything Effect-shaped — gateways, retry middleware, JSON decoding, error tagging — sits behind that one line.
- `boardProgram = loadBoard.pipe(Effect.provide(BoardConfigLive))` provides the per-context config Layer at the handler. `appRuntime` provides the cross-cutting layers (`HttpClient`, `JiraGateway`, `ServerEnv`); each context plugs its own config in here. This keeps `appRuntime` reusable across handlers without leaking each context's config into the global runtime.
- The `if (!wire.ok && wire.error._tag === 'InternalError')` arm is the one place where defects (caught by `Effect.catchAllDefect` inside `toWire` — see 10.6) get demoted to a server-function failure. TanStack Query's `isError` flips and the UI shows "Sync failed". Tagged failures (`Unauthorized`) stay as a normal `{ ok: false, error: ... }` payload.

### 10.2. The runtime — `appRuntime` composes gateways, config, and HTTP middleware

[`appRuntime`](../src/server/runtime/app-runtime.ts) is a process-scoped `ManagedRuntime` defined once and shared by every handler.

```ts
// src/server/runtime/app-runtime.ts
import { ManagedRuntime } from 'effect'
import { appLayer } from './app-layer'

export const appRuntime = ManagedRuntime.make(appLayer)
```

The runtime resolves the `R` channel — the requirements channel of every `Effect<A, E, R>` running on it — by composing [`appLayer`](../src/server/runtime/app-layer.ts):

```ts
// src/server/runtime/app-layer.ts (excerpt)
const HttpClientLive: Layer.Layer<HttpClient.HttpClient> = Layer.effect(
  HttpClient.HttpClient,
  Effect.map(HttpClient.HttpClient, (base) =>
    base.pipe(
      HttpClient.transform((eff, request) =>
        eff.pipe(Effect.timeoutFail({ duration: TIMEOUT_DURATION /* ... */ })),
      ),
      HttpClient.retryTransient({ schedule: retrySchedule }),
    ),
  ),
).pipe(Layer.provide(FetchHttpClient.layer))

export const appLayer: Layer.Layer<
  ServerEnv | HttpClient.HttpClient | JiraGateway | GitlabGateway
> = GatewaysLive.pipe(Layer.provideMerge(InfraLive))
```

**What to notice:**

- `ManagedRuntime` is the per-process Effect runtime. It runs `loadBoard` with all its required dependencies (`JiraGateway`, `BoardConfig`, `ServerEnv`, `HttpClient`) already provided — when `loadBoard`'s `R` channel resolves, none are missing.
- The retry+timeout middleware lives in the `HttpClient` Layer, not in individual gateway methods. Every Effect issuing a request through `HttpClient.execute` inherits 2-attempt exponential backoff on transient failures and a 10-second timeout. Per [ADR 0005's policy menu](./adr/0005-effect-server-architecture.md), per-call overrides via `Effect.retry` / `Effect.timeout` are the upgrade path.
- The Layer composition is bottom-up: `InfraLive` (`ServerEnv` + `HttpClient`) → `GatewaysLive` (Jira + GitLab Tags). The handler then layers `BoardConfigLive` on top (10.1). Each layer can fail independently — missing env vars throw at runtime construction; HTTP middleware degrades requests rather than the whole runtime.

### 10.3. The application service — `Effect.gen` over Tags

[`loadBoard`](../src/server/contexts/board/application/load-board.ts) is a single `Effect` value: framework-free, declarative, fully typed.

```ts
// src/server/contexts/board/application/load-board.ts (excerpt)
export const loadBoard: Effect.Effect<LoadBoardOk, Unauthorized, JiraGateway | BoardConfig> =
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

**What to notice:**

- The **`R` channel** — `JiraGateway | BoardConfig` — is the public requirements declaration. Anyone importing `loadBoard` sees, at the type level, exactly which Tags must be in scope before it can run. The handler's `Effect.provide(BoardConfigLive)` discharges `BoardConfig`; `appRuntime` discharges `JiraGateway`.
- The `E` channel — `Unauthorized` — names which failures `loadBoard` exposes to its caller. `searchIssues` returns three tags (`Unauthorized | NotFound | Rejected`); the `Effect.catchTags` block demotes the unexpected ones (`NotFound`, `Rejected`) to defects via `Effect.die`. The pedagogical line: tagged failures are values to handle; everything else is a defect that bypasses the wire mapper unless caught.
- `Effect.gen(function* () { ... })` reads like async/await: `yield* JiraGateway` resolves the Tag (the runtime supplies the live shape); `yield* jira.searchIssues(...)` runs the Effect and binds the success value. The function is pure data — nothing executes until `appRuntime.runPromise` fires it.

### 10.4. The gateway port — `Context.Tag`

The port — what `loadBoard` depends on — is a `Context.Tag` declared once in [`src/server/gateways/jira/port.ts`](../src/server/gateways/jira/port.ts). It is the shape every consumer sees and every adapter must satisfy.

```ts
// src/server/gateways/jira/port.ts (excerpt)
export type JiraGatewayShape = {
  readonly searchIssues: (
    jql: string,
    fields: readonly string[],
  ) => Effect.Effect<RawSearchResponse, JiraGatewayError>
  readonly getIssue: (
    key: string,
    fields: readonly string[],
  ) => Effect.Effect<RawDetailedIssue, JiraGatewayError>
  /* ... other methods ... */
}

export class JiraGateway extends Context.Tag('JiraGateway')<JiraGateway, JiraGatewayShape>() {}
```

**What to notice:**

- The Tag pattern (`class JiraGateway extends Context.Tag('JiraGateway')<JiraGateway, JiraGatewayShape>() {}`) is Effect's type-level service identifier. The string `'JiraGateway'` is its runtime key; the type parameter `JiraGatewayShape` is its surface. Application code references the class; `yield* JiraGateway` resolves to a `JiraGatewayShape` at runtime.
- Every method returns `Effect<A, E>` — never `Promise<A>`, never throwing. The `E` channel exposes a fixed `JiraGatewayError` union (`Unauthorized | NotFound | Rejected`) so every consumer matches against the same set.
- One gateway, all methods. Per [ADR 0005](./adr/0005-effect-server-architecture.md), the server uses a **shared port** rather than the client's per-context-view rule, because Jira's methods are atomic I/O operations with identical signatures across consumers.

### 10.5. The gateway adapter — `HttpClient.execute` + `Schema.TaggedError`

The HTTP adapter in [`src/server/gateways/jira/http-adapter.ts`](../src/server/gateways/jira/http-adapter.ts) is a `Layer.effect` that builds a `JiraGatewayShape` from injected dependencies (`HttpClient.HttpClient`, `ServerEnv`).

```ts
// src/server/gateways/jira/http-adapter.ts (excerpt)
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

The tagged-error classes themselves, in [`src/server/gateways/jira/errors.ts`](../src/server/gateways/jira/errors.ts):

```ts
// Class names are gateway-prefixed; wire tags stay un-prefixed because clients
// already discriminate by gateway via the response envelope, not the tag string.
export class JiraUnauthorized extends Schema.TaggedError<JiraUnauthorized>()('Unauthorized', {}) {}
export class JiraNotFound extends Schema.TaggedError<JiraNotFound>()('NotFound', {}) {}
export class JiraRejected extends Schema.TaggedError<JiraRejected>()('Rejected', {
  message: Schema.String,
}) {}
```

**What to notice:**

- `client.execute(request)` is the only place HTTP actually happens. It's the same `HttpClient` instance the runtime wrapped with retry+timeout in 10.2 — every method on this adapter inherits that middleware, with no per-method opt-in.
- `HttpClientResponse.matchStatus` collapses status code branches into one expression: `2xx` decodes the body, `401`/`404` short-circuit to typed failures, `orElse` reads the error body and packs it into `JiraRejected.message`. HTTP-level cases are all expressed as `Effect.fail(new TaggedError(...))` — failures-as-values, not throws.
- `Schema.TaggedError` does double duty: it gives `Effect.catchTag` / `Effect.catchTags` an ergonomic match (10.3's catch block uses it) _and_ it ships a `Schema` so the wire boundary mapper can encode each instance to JSON without a hand-written serialiser. The Jira and GitLab gateways co-exist because the class names are gateway-prefixed (`JiraUnauthorized`, `GitlabUnauthorized`), even though both encode to the same wire `_tag: 'Unauthorized'` — the response envelope already discriminates which gateway produced the error.

### 10.6. The wire boundary — `toWire`

[`src/server/wire/to-wire.ts`](../src/server/wire/to-wire.ts) is the only place Effect values become JSON. One function, one job.

```ts
// src/server/wire/to-wire.ts
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

**What to notice:**

- Three arms: `onSuccess` is **pass-through** (`{ ok: true, ...value }` — today's success types are JSON-flat per [ADR 0005](./adr/0005-effect-server-architecture.md)); `onFailure` runs `Schema.encodeUnknownSync(errorSchema)` to produce `{ _tag, ...payload }`; `Effect.catchAllDefect` demotes anything that escapes the `E` channel to `{ _tag: 'InternalError' }` and logs it.
- Each handler passes its **per-context** error schema (here `LoadBoardError = Schema.Union(JiraUnauthorized)` from [`src/server/contexts/board/errors.ts`](../src/server/contexts/board/errors.ts)), not an app-wide one. Adding a new tag to the union surfaces here as a compile error; the wire codec is generated from the schema, not hand-written.
- The signature is `Effect<WireResult<A>, never, R>`: the error channel is erased. Once a program goes through `toWire`, every outcome is a value in the success channel; the handler's `runPromise` cannot reject for application reasons.

### 10.7. The trip back

TanStack Start serialises the `WireResult` to JSON and sends it back. The client side is what sections 6–8 already cover from the other end: the client's `searchIssues()` returns a tagged JSON shape, neverthrow's `Result` wraps it, and `ts-pattern` matches the `_tag` exhaustively.

The client's `BoardUnauthorized` (a neverthrow tagged-error class) and the server's `JiraUnauthorized` (a `Schema.TaggedError`) are independent classes; they communicate only through the `_tag: 'Unauthorized'` literal in the JSON wire shape. Neither side imports the other's library, per [ADR 0004](./adr/0004-neverthrow-client-effect-server.md).

**What to notice:**

- The whole round trip — `appRuntime.runPromise(toWire(loadBoard.pipe(Effect.provide(BoardConfigLive)), LoadBoardError))` — is one expression, one composition point per handler. New use-cases are new application Effects + new error schemas; the runtime, the wire mapper, and the gateway adapter don't change.
- Two-level injection across the trace: per-context Tags (`BoardConfig`) discharge at the handler's `Effect.provide`; cross-cutting Tags (`JiraGateway`, `ServerEnv`, `HttpClient`) discharge in `appRuntime`. The split is what lets every handler share one process-scoped runtime without coupling on each other's config.
- Symmetry with the client's seven layers: server domain (10.3, helpers like `buildBoardJql` / `toBoardIssue`), gateway port (10.4), gateway adapter (10.5), application service (10.3 again), wire boundary mapper (10.6), server-function handler (10.1). No view, presenter, view-model, or coordinator on the server — those are client-side. Cross-context composition for reads happens at the server-function layer.

## What to read next

- [`docs/layers.md`](./layers.md) — the same architecture, but viewed _layer by layer_ rather than action by action. One annotated example per layer (domain, gateway, application service, view-model, presenter, view, coordinator), drawn from the migrated codebase. (Authored in [slice 60](../.agents/issues/60-arch-layers-reference.md), the sibling of this tour.)
- [`CONTEXT-MAP.md`](../CONTEXT-MAP.md) — the architectural overview: contexts, the dependency law, governance, library choices.
- [ADR 0002 — Bounded contexts and layer vocabulary](./adr/0002-bounded-contexts-and-layer-vocabulary.md) — why the codebase is organised by bounded contexts with a shared seven-layer vocabulary.
- [ADR 0003 — Framework-free view-models](./adr/0003-framework-free-view-models.md) — why every non-trivial screen splits into `view-model.ts` + `use-*.ts`, and why that split is the React-decoupling claim made verifiable.
- [ADR 0004 — neverthrow on the client, Effect on the server](./adr/0004-neverthrow-client-effect-server.md) — why the client and the server are allowed to use different result-type idioms across a JSON boundary.
- Per-context glossaries: [Board](../src/contexts/board/CONTEXT.md), [Detail](../src/contexts/detail/CONTEXT.md), [Capture](../src/contexts/capture/CONTEXT.md), [Review](../src/contexts/review/CONTEXT.md). Each `CONTEXT.md` carries its context's local vocabulary, use-cases, view-model state machine, and public surface.

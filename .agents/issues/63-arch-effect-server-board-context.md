# 63 — Effect server: Board context migration (Jira gateway + Board exemplar)

**Type:** HITL

## Parent

[Effect server refactor PRD](../prds/effect-server-refactor.md)

## What to build

End-to-end migration of the **Board server-side flow** into the new Effect-TS architecture. This is the **server exemplar** — the canonical example that subsequent context migrations (64 Detail, 65 Capture, 66 Review) follow. All server-side patterns (gateway port + adapter, application service shape, error union schema, wire mapper integration, test idioms with `@effect/vitest` + `Layer.succeed`) crystallise here and cascade across 64–66, so this slice is HITL: review-time discussions are expected to surface unforeseen issues; once the pattern lands, the others follow mechanically.

After this slice merges, the Jira gateway lives in the new layout; Board's `loadBoard` use-case is an Effect-based application service; the `searchIssues` server function calls `appRuntime.runPromise(toWire(...))`; old `src/server/jira/{gateway, http-gateway, issue-service}.ts` continue to exist and serve the _non-Board_ handlers (Detail's, Capture's) until 64 and 65 migrate them.

Concretely:

- **Jira gateway** in `src/server/gateways/jira/`:
  - `port.ts` — `class JiraGateway extends Context.Tag("JiraGateway")<JiraGateway, JiraGatewayShape>() {}` with all 6 methods (`getMyself`, `searchIssues`, `getIssue`, `getTransitions`, `transitionIssue`, `createIssue`). Per Q10's "shared port per gateway" decision, every method is on this one port; contexts choose which to use.
  - `types.ts` — gateway-output types co-locate here per Q14.3 (`BoardIssue`, `DetailIssue`, `LinkedIssueRef`, `IssueLink`, `EpicRef`, `AllowedTransition`, `GatewayUser`, `RawDetailedIssue`-as-internal). Cross-context types live with the gateway, not in a kernel.
  - `errors.ts` — `Schema.TaggedError` classes (`Unauthorized`, `NotFound`, `Rejected`).
  - `http-adapter.ts` — `JiraGatewayLive: Layer<JiraGateway, never, ServerEnv>` using `@effect/platform`'s `HttpClient`. Each method built from `HttpClient.execute(HttpClientRequest.get(...))`-style composition; response decoded via `HttpClientResponse.schemaBodyJson(WireResponse)`; HTTP error mapping via `Effect.catchTag("ResponseError", …)` → tagged errors.
  - `http-adapter.test.ts` — `@effect/vitest`'s `it.effect` with `Layer.succeed(HttpClient.HttpClient, fakeClient)`. The existing `Deps.fetch` injection pattern from `server/jira/http-gateway.test.ts` retires for Board's surface; remaining methods stay tested via the old test file until 64–65 migrate them.
- **`appLayer` extended** in `src/server/runtime/app-layer.ts` to merge `JiraGatewayLive` (provided with `ServerEnv`).
- **Board context** in `src/server/contexts/board/`:
  - `config.ts` — `class BoardConfig extends Context.Tag("BoardConfig")<BoardConfig, { projectKey: string; labelFilter: string; hideLabels: readonly string[]; doneWindowDays: number; baseUrl: string }>() {}` plus `BoardConfigLive: Layer<BoardConfig, never, ServerEnv>`.
  - `errors.ts` — Board's per-context error union (`LoadBoardError = Schema.Union(Unauthorized)`).
  - `application/load-board.ts` — `loadBoard: Effect<LoadBoardOk, LoadBoardE, JiraGateway | BoardConfig>` built with `Effect.gen`. Replaces today's `loadBoard()` method in `JiraIssueService` (the JQL building, hide-label filtering, parent-as-epic mapping). The `if (!result.ok) ...` ladder retires; tagged-error short-circuiting via `Effect.catchTag` or `Effect.matchTags`.
  - `application/load-board.test.ts` — `it.effect("...", () => program.pipe(Effect.provide(testLayer)))` with hand-rolled fakes via `Layer.succeed(JiraGateway, fakeJira)` and `Layer.succeed(BoardConfig, fakeConfig)`. Asserts both success and tagged-error paths.
  - `application/__fixtures__/fake-jira-gateway.ts` — hand-rolled fake `JiraGateway` for Board's tests (only the methods Board uses need behavior; partial fake casting is fine per Q10's note).
  - `domain/` — empty for Phase 1; Board has no Board-specific server-side pure functions yet.
  - `CONTEXT.md` — short, focused per-context doc per PRD §"Documentation footprint": public server-function surface, application-service surface, gateway dependencies, error union.
- **Server function** in `src/server/server-functions/board.ts`:
  - `export const searchIssues = createServerFn({ method: 'GET' }).handler(() => appRuntime.runPromise(toWire(program, LoadBoardError)))` where `program` is `loadBoard.pipe(Effect.provide(BoardConfigLive))` (or however the config layer is wired).
- **Route updates.** The route(s) that previously imported `searchIssues` from `~/server/jira/server-functions` switch to `~/server/server-functions/board`. Other handlers (`getIssue`, `getTransitions`, `transitionIssue`, `getMyself`, `createIssue`, `getMyEpics`) keep their old imports until 64–65.
- **Old code preserved.** `src/server/jira/{gateway, http-gateway, issue-service, server-functions}.ts` continue to exist; only the `searchIssues` handler is gone from `server-functions.ts`. The `loadBoard()` method on `JiraIssueService` becomes unused; **leave it** (an orphan) until lockdown 67 deletes the whole file.
- **Dep-cruiser rules tightened.** With one gateway and one context populated, the from-inception rules in 62 now have real folders to evaluate against. `no-cross-context-server` and `no-cross-gateway-adapter` keep passing (only one gateway, one context).

## Acceptance criteria

- [ ] `src/server/gateways/jira/{port, types, errors, http-adapter, http-adapter.test}.ts` exist and are populated.
- [ ] `JiraGateway` is a `Context.Tag` with the same 6-method interface (signatures shape-equivalent to today's `JiraGateway` interface, but each method returns `Effect<A, E>` instead of `Promise<JiraResult<A>>`).
- [ ] `JiraGatewayLive: Layer<JiraGateway, never, ServerEnv>` builds the live HTTP adapter via `@effect/platform`'s `HttpClient`. The `HttpClient.layer` in the runtime applies retry (2 exp-backoff transient) and timeout (10s).
- [ ] `src/server/contexts/board/{config, errors, application, CONTEXT.md}` exist; `application/load-board.ts` and `application/load-board.test.ts` are populated; `application/__fixtures__/fake-jira-gateway.ts` is a hand-rolled fake.
- [ ] `load-board.test.ts` uses `@effect/vitest`'s `it.effect`; no `vi.mock` of internal modules; both success and `Unauthorized` paths asserted.
- [ ] `src/server/server-functions/board.ts` exports `searchIssues` (the existing handler name) and uses `appRuntime.runPromise(toWire(loadBoard.pipe(Effect.provide(...)), LoadBoardError))`.
- [ ] The `searchIssues` route handler is no longer exported from `src/server/jira/server-functions.ts`; route imports updated to `~/server/server-functions/board`.
- [ ] Old `src/server/jira/{gateway, http-gateway, issue-service}.ts` are unchanged in shape. `JiraIssueService.loadBoard` becomes orphaned but is not deleted until lockdown.
- [ ] `BoardIssue` (and other Jira types currently in `~/server/jira/issue-service`) are now exported from `~/server/gateways/jira/types`. Client `kernel/jira.ts`'s re-export source path updates to `~/server/gateways/jira` (or both paths work via re-export shim during the cohabitation period — call out which in the PR description).
- [ ] No file under `src/server/contexts/board/` imports from `src/server/contexts/<other>/` or from `react`, `@tanstack/react-*`, `sonner`, `window`, `document` (verified by `dependency-cruiser`).
- [ ] No file under `src/server/gateways/jira/http-adapter.ts` imports from `src/server/gateways/<other>/` (verified).
- [ ] All `if (!result.ok) { if (reason === 'unauthorized') … }` ladders in the migrated Board path are gone (replaced by `Effect.catchTag` / `Effect.matchTags`).
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test && pnpm test:e2e` all green.
- [ ] User-visible behaviour is identical (e2e is the gate; the wire shape is unchanged per ADR-0004).
- [ ] `docs/architecture.svg` regenerated and committed; new edges (`server-functions/board → contexts/board/application`, `contexts/board/application → gateways/jira/port`) are visible.

## Blocked by

- 62 — Effect server: foundation

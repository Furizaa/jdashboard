# clashboard — Effect-TS server refactor (team-template, server side)

## Problem Statement

clashboard's client refactor (`.agents/prds/clean-architecture-refactor.md`) landed a hexagonal, bounded-context architecture with explicit layers, a strict dependency DAG, framework-free view-models, and per-layer test approaches. The server side was deliberately scoped out of that pass with the note _"server-side `JiraIssueService` / `GitlabMrService` stay as-is; revisited in the Effect-TS server pass."_ This is that pass.

Today's server has good bones (port + adapter pattern at the gateway, factory-constructed services, hand-rolled discriminated-union results) but several structural problems:

- **The word "service" is overloaded.** `JiraIssueService` is a gateway-orchestrator; the (now-renamed) `DashboardService` was a use-case layer. The new layer vocabulary on the client retires "service" in favour of distinct names — the server hasn't followed.
- **Cross-namespace coupling.** `server/gitlab/review-service.ts` imports `JiraIssueService` to drive `bulkLoadIssues`. The cross-system orchestration (`getReviewCards`) is structurally smuggled inside the GitLab folder rather than living somewhere that owns _both_ systems.
- **Result-handling ladders.** Every service method has a `if (!result.ok) { if (reason === 'unauthorized') ... if (reason === 'rejected') throw ... }` pattern repeated dozens of times. Not broken — just verbose, brittle, and fights every Effect-shaped library that exists.
- **No retries, no timeouts, no concurrency caps.** `Promise.all` over MR fan-outs is unbounded; a hung fetch hangs forever; transient flakes bubble.
- **Singleton lazy-init for service caching.** `let cached: JiraIssueService | null = null; ... if (cached === null) cached = createJira...(...)` in `server-functions.ts`. Works; not testable without import-graph tricks.
- **DI is implicit factory closure.** `createJiraIssueService(gateway, config)` works but doesn't compose; tests inject fakes through factory args; production wires the dependency tree by hand at the entry point.

These problems are not on fire. They are the kind of problems a personal dashboard tolerates and a growing codebase outgrows. The team-template angle decides this: clashboard is the worked example for the team's portfolio, and the server side currently teaches _almost nothing_ about how a TypeScript server should be structured. The Effect-TS pass is the chance to land an explicit, named, enforced server architecture symmetric in spirit (but deliberately different in detail) with what the client now ships.

The driver mix is **90% team-template pedagogy + 10% anticipated growth.** Anticipated growth means: a database-backed `code-health` context (coverage and lint-trend indicators on cards) is on the medium-term roadmap. That context is **out of scope this refactor** but informs shape choices throughout — the architecture is designed to accept it without further reshape.

## Solution

A scoped refactor of clashboard's `src/server/` tree that lands an Effect-TS architecture organised by **two orthogonal axes** — `gateways/<system>/` for I/O ports and adapters, `contexts/<name>/` for use-case clusters — with full Layer-based DI, `@effect/platform`'s `HttpClient`, Schema-tagged errors, a thin wire-boundary mapper, and per-layer test approaches built on `@effect/vitest`.

The destination shape:

- `src/server/gateways/{jira, gitlab}/` — one folder per external system. Each holds the gateway port (a `Context.Tag`), the HTTP adapter (a `Layer`), gateway-output types (cross-context types co-locate here), and gateway-specific tagged errors.
- `src/server/contexts/{board, detail, capture, review}/` — one folder per use-case cluster. Each holds `domain/` (pure functions), `application/` (one file per use-case, returning `Effect<A, E, R>`), context-specific tagged errors, and a context-specific config Layer. **Server contexts mirror client contexts where the use-case maps to a UI surface; future server-only contexts are anticipated** (e.g., `code-health`).
- `src/server/runtime/` — `ServerEnv` Tag and Layer (replacing today's `getServerEnv()` lazy singleton); the composed `appLayer`; the single `ManagedRuntime` (`appRuntime`).
- `src/server/wire/` — the `toWire(program, errorSchema)` helper that maps `Effect<A, E>` into the JSON shape the client expects (`{ ok: true, ...A } | { ok: false, error: { _tag, ...payload } }`).
- `src/server/server-functions/` — TanStack Start `createServerFn(...).handler(...)` definitions, one per server function, each calling `appRuntime.runPromise(toWire(programForThisCall, errorSchemaForThisCall))`.

Layer vocabulary (server side): **domain / gateway port / gateway adapter / application service / wire boundary mapper / server-function handler.** No view-model, presenter, view, or coordinator on the server (those are client-side concepts). Cross-context composition for _reads_ happens at the server-function layer (the route equivalent on the client). Cross-context _workflows_ with side effects, if any appear, get a `server/coordinator/` folder when the need is concrete — deferred until then.

Result types are `Effect<A, E, R>` throughout. `E` is a union of `Schema.TaggedError` classes (Effect-native + free wire codec). `R` is the dependency channel — Layers carry it. Wire format is unchanged from ADR 0004: tagged JSON the client unwraps via neverthrow. ts-pattern remains the matching primitive on the client; on the server, `Effect.catchTag` and `Effect.matchTags` cover the same lesson natively.

Architectural rules are codified as `dependency-cruiser` `forbidden` rules: `effect` forbidden in client code; `neverthrow` forbidden in server code; `contexts/A → contexts/B` forbidden; `gateways/<X>/<adapter>` cannot import other gateway adapters; `kernel` already cannot import server. New rules from inception in Phase 0; lockdown at Phase 5 brings every rule to `error` severity.

Migration is incremental, exemplar-first: a foundation phase scaffolds infrastructure (one PR, no behaviour change); Board is migrated first end-to-end as the canonical example through every server layer; Detail, Capture, Review follow; old `server/jira/`, `server/gitlab/` folders deleted at lockdown. The existing e2e harness (MSW Node + Playwright per ADR-0001) is the safety net throughout — mocked at the HTTP boundary, the harness sees only the wire shape and is invisible to Effect-vs-Promise internals.

The success criterion of the team-template angle is operational: a reader walking into `src/server/` cold should see canonical idiomatic Effect — Layer-based DI, `HttpClient` for HTTP, `Schema.TaggedError` for errors, `Effect.gen` and `Effect.all({ concurrency })` for orchestration, `@effect/vitest`'s `it.effect(...)` for tests — not Effect-flavoured Promise code. The architecture is the worked example.

## User Stories

### Architecture vocabulary and structure

1. As a teammate adopting this template, I want the server organised on two axes (`gateways/` for external systems, `contexts/` for use-case clusters), so that "where does the Jira HTTP error parsing live?" and "where does the cross-system Review orchestration live?" each have an obvious answer.
2. As clashboard's maintainer, I want every server-side gateway to ship as a `Context.Tag` port + a `Layer` adapter, so that "swap the Jira HTTP adapter for a fake in tests" is one `Layer.succeed` line.
3. As clashboard's maintainer, I want server contexts that mirror client contexts where the use-case is a UI surface (`board`, `detail`, `capture`, `review`), so that the server's vocabulary matches the client's at every level the mapping is honest.
4. As clashboard's maintainer, I want the server architecture to **accept** future server-only contexts (e.g., `code-health` for coverage/lint trend indicators) without reshape, so that anticipated growth slots in cleanly.
5. As clashboard's maintainer, I want cross-namespace coupling between `gitlab/review-service` and `jira/issue-service` resolved by the new `contexts/review/application/` depending on `JiraGateway` and `GitlabGateway` ports as **peers**, so that the structural smell disappears.
6. As a teammate adopting this template, I want server cross-context types to live with the gateway that produces them (e.g., `BoardIssue` lives in `gateways/jira/types.ts`), so that types live next to their producer and no `server/kernel/` cargo-cult appears.
7. As clashboard's maintainer, I want the word "service" alone retired on the server side too, so that the layer vocabulary is one set across the whole codebase.

### Dependency injection (Layer-based)

8. As clashboard's maintainer, I want every gateway exposed via a `Context.Tag` and provided by a `Layer.effect(...)` adapter, so that DI is composable and the team-template shows Effect's actual DI idiom.
9. As clashboard's maintainer, I want `ServerEnv` itself converted from a lazy singleton to a `Layer.effect(ServerEnv, validateEnv)`, so that env validation participates in the same DI graph as everything else and fails fast at startup.
10. As clashboard's maintainer, I want one `ManagedRuntime` per server process (not per request), so that Layer construction is paid once and `runtime.runPromise(...)` is the only per-request cost.
11. As clashboard's maintainer, I want shared ports per gateway (one `JiraGateway` Tag with all methods; contexts choose which methods to use), so that the canonical signatures live once and tests use partial fakes.
12. As a teammate adopting this template, I want the **divergence from the client's per-context port-view rule** documented as a teaching moment, so that readers learn _when_ per-context port views pay off (conceptually different views) and _when_ shared ports pay off (atomic I/O with same signatures).

### HTTP, retries, timeouts, concurrency

13. As clashboard's maintainer, I want every gateway adapter built on `@effect/platform`'s `HttpClient`, so that requests, responses, retries, timeouts, and Schema-validated bodies are first-class.
14. As clashboard's maintainer, I want a default retry policy of 2 attempts with exponential backoff, applied only to transient failures (network errors and HTTP 502/503/504), wired as an `HttpClient.layer` middleware, so that 401/404 still fail fast (preserving the wire contract) but transient flakes get absorbed.
15. As clashboard's maintainer, I want a default 10s timeout per HTTP call, wired as `HttpClient.layer` middleware, with per-call `Effect.timeout` overrides for known-slow operations, so that hung fetches do not hang the dashboard indefinitely.
16. As clashboard's maintainer, I want fan-outs (e.g., MR detail/discussions/approvals/reviewers) capped at 5 concurrent HTTP requests via `Effect.all(arr, { concurrency: 5 })` at the application-service level, so that Jira's rate limits and GitLab's burst tolerance are respected.
17. As clashboard's maintainer, I want a future upgrade path from per-call concurrency caps to per-gateway `RateLimiter` Layers documented, so that when Jira limits start being hit in practice, the swap is a Layer change rather than a code rewrite.
18. As clashboard's maintainer, I want HTTP error mapping (401 → `Unauthorized`, 404 → `NotFound`, others → `Rejected`) lifted from today's `call<T>(fn)` helpers into per-gateway `HttpClient` interceptors or `HttpClientResponse.matchStatus(...)` clauses, so that the mapping is composition rather than nested ifs.

### Schemas, errors, and the wire boundary

19. As clashboard's maintainer, I want `effect/Schema` adopted for **server-internal** validation (HTTP response shapes, internal codecs, ingestion payloads when they arrive), so that `HttpClient.schemaBodyJson(...)` and Schema-encoded errors are first-class.
20. As clashboard's maintainer, I want **Zod retained** as the validator for any schema that crosses the client/server boundary (today: only `quickCreateSchema`), so that one validator owns the form-input contract that both sides see.
21. As clashboard's maintainer, I want every server-side tagged error declared as a `Schema.TaggedError` class, so that `Effect.catchTag` works first-class **and** the wire encoder is `Schema.encodeUnknownSync(ErrorUnion)` for free.
22. As clashboard's maintainer, I want a single `toWire(program, errorSchema)` helper (in `src/server/wire/to-wire.ts`) that converts `Effect<A, E>` into `{ ok: true, ...A } | { ok: false, error: { _tag, ...payload } }`, so that there is one canonical place where Effect-internal values become JSON.
23. As clashboard's maintainer, I want each handler pass its **per-context error union schema** to `toWire`, so that the wire encoder reflects the type-level error declaration and adding a new error tag is a compile-error visible at the handler.
24. As clashboard's maintainer, I want success-side encoding to **pass through** unchanged for Phase 1 (today's success types are JSON-flat), with **Schema-encoded success** introduced when types get richer (e.g., `Date` snapshots in the future `code-health` context), so that the migration to fuller Schema encoding is itself a teaching moment.
25. As clashboard's maintainer, I want `Effect.catchAllDefect` wired into the wire mapper to log defects and return `{ ok: false, error: { _tag: 'InternalError' } }`, so that the failure-vs-defect distinction is taught and the client always sees a tagged shape.

### Observability

26. As clashboard's maintainer, I want Effect's `Logger` adopted fully (pretty-printed in dev, structured JSON in prod) wired as a `Layer`, so that ad-hoc `console.error` is retired and the team-template shows Effect's logging idiom.
27. As clashboard's maintainer, I want Effect's `Tracer` adopted with a console-only exporter, so that `Effect.withSpan(...)` is a real dev tool for "why is this slow?" investigations and the upgrade path to OTel/Honeycomb is a Layer swap.
28. As clashboard's maintainer, I want Effect's `Metrics` **deferred** until the first metric is worth measuring, so that observability is adopted piece-by-piece rather than wired by cargo.
29. As a teammate adopting this template, I want the observability decisions framed as **menus with chosen point + upgrade path**, so that another project re-running this design conversation can pick a different point on the same menu.

### Tests

30. As clashboard's maintainer, I want hand-rolled fakes provided via `Layer.succeed(Tag, fake)`, never `vi.mock` of internal modules, so that the rule mirrors the client's hand-rolled-fakes rule with Effect's mechanism.
31. As clashboard's maintainer, I want `@effect/vitest` adopted from the start (`it.effect("...", () => program)`), so that test bodies read in idiomatic Effect rather than wrapped in `Effect.runPromise` boilerplate.
32. As clashboard's maintainer, I want gateway HTTP adapter tests to fake `HttpClient.HttpClient` via `Layer.succeed(...)`, so that the existing `Deps.fetch` injection pattern is replaced by the seam Effect provides.
33. As clashboard's maintainer, I want application-service tests to fake gateway `Context.Tag`s via `Layer.succeed(...)`, with hand-rolled fakes in `__fixtures__/` per context, so that test setup is one Layer per fake.
34. As clashboard's maintainer, I want the wire boundary mapper directly unit-tested (input: `Effect<A, E>`; output: known JSON shape), so that tagged-error encoding and success-side wrapping are pinned.
35. As clashboard's maintainer, I want the existing pure-module tests (`mr-key-map`, `mr-status`, `quick-create-schema`) to follow their modules to new homes via `git mv` + import-path updates, so that no semantic test changes happen during structural moves.
36. As clashboard's maintainer, I want the e2e harness (MSW Node + Playwright, ADR-0001) **untouched** by this refactor, so that the externally-anchored safety net survives every internal Effect-vs-Promise reshape.

### Migration

37. As the refactor's author, I want migration broken into named phases (Foundation → Board exemplar → Detail → Capture → Review → Lockdown → Documentation), so that progress is legible as a sequence of merged PRs.
38. As the refactor's author, I want Phase 0 (foundation) shipped as one PR with no behaviour change, so that infrastructure (Effect deps; folder scaffolding; runtime + appLayer + toWire helper; expanded dep-cruiser rules) lands as a reviewable unit.
39. As the refactor's author, I want Board migrated first end-to-end as the exemplar (Phase 1), with the Jira gateway port + adapter, the Board application service, the Board server function, and the wire mapper integration all landing together as one vertical slice, so that the complete pattern exists before further contexts follow.
40. As the refactor's author, I want Detail, Capture, and Review contexts migrated in turn after Board (Phases 2–4), so that each follows the exemplar; Capture exercises the Zod-at-boundary + Schema-internal split; Review introduces the GitLab gateway and resolves the cross-namespace coupling smell.
41. As the refactor's author, I want lockdown (Phase 5) to delete the old `server/jira/` and `server/gitlab/` folders and bring every dep-cruiser rule to `error`, so that the architecture is fully enforced and no parallel old-shape paths linger.
42. As the refactor's author, I want narrative documentation (`docs/tour.md` extension into the server side, `docs/layers.md` server-layer sections) written in Phase 6, so that the docs describe the as-merged architecture rather than the planned one.
43. As the refactor's author, I want a feature freeze on the server during the refactor, so that cohabitation of `server/jira/` and `server/gateways/jira/` stays bounded.
44. As the refactor's author, I want each context's migration to either fully land or stay un-started — never half-merged — so that at any commit on master, the server state is internally consistent.

### Documentation

45. As a teammate adopting this template, I want one omnibus ADR (`docs/adr/0005-effect-server-architecture.md`) covering the Effect server design as a coherent package (DI, HTTP, Schema, errors, wire, ports, policies, observability, tests, divergences from client), so that the interlinked decisions read together.
46. As a teammate adopting this template, I want the existing `CONTEXT-MAP.md` extended with a "Server architecture (Effect-TS pass)" section listing folder layout, layer vocabulary, dependency law, library additions, and the divergences from client rules, so that the team-template's one map covers the whole system.
47. As a teammate adopting this template, I want each server context to have its own short, focused `server/contexts/<name>/CONTEXT.md` (public server-functions, application-service surface, gateway dependencies, anything domain-specific), so that the per-context structure mirrors the client and accommodates future contexts (e.g., `code-health`) cleanly.
48. As a teammate adopting this template, I want `docs/tour.md` extended in Phase 6 to continue the trace through the server (handler → `toWire` → application service → gateway → `HttpClient` → Jira → response → wire), so that the manga's first chapter spans every layer of the whole system.
49. As a teammate adopting this template, I want `docs/layers.md` extended with one annotated server-layer example per layer, so that "what does a server-side application service look like?" is answerable by pointing at a file.
50. As clashboard's maintainer, I want ADR-0004 receive a one-paragraph addendum acknowledging that team-template pedagogy is the dominant driver (not just "composable async / retries / DI"), so that the rationale on record matches the actual design conversation.

## Implementation Decisions

### Top-level folder layout

```
src/server/
├── runtime/
│   ├── server-env.ts          # ServerEnv Tag + ServerEnvLive Layer
│   ├── app-layer.ts           # composed Layer<all live services>
│   └── app-runtime.ts         # ManagedRuntime.make(appLayer) singleton
├── wire/
│   ├── to-wire.ts             # toWire(program, errorSchema) helper
│   └── to-wire.test.ts        # direct unit tests
├── gateways/<system>/
│   ├── port.ts                # Context.Tag + interface
│   ├── http-adapter.ts        # Layer.effect(Tag, ...) using HttpClient
│   ├── http-adapter.test.ts   # Layer.succeed(HttpClient.HttpClient, fake)
│   ├── types.ts               # gateway-output types (cross-context types live here)
│   ├── errors.ts              # Schema.TaggedError classes for this gateway
│   └── (pure modules where they belong to the gateway, e.g. wire mappers)
├── contexts/<name>/
│   ├── domain/                # pure functions; no Effect imports unless trivial
│   ├── application/
│   │   ├── <use-case>.ts      # one file per use-case, returning Effect<A, E, R>
│   │   ├── <use-case>.test.ts # @effect/vitest with Layer.succeed fakes
│   │   └── __fixtures__/      # hand-rolled fake gateway implementations
│   ├── errors.ts              # context-specific Schema.TaggedError classes
│   ├── config.ts              # context-specific config Tag + Layer
│   └── CONTEXT.md             # per-context glossary, surface, gateway deps
└── server-functions/
    └── <name>.ts              # createServerFn(...).handler(() => appRuntime.runPromise(toWire(...)))
```

### Layer vocabulary (server side)

- **Domain** — pure functions over gateway-output types and primitive values. No I/O, no time, no Effect imports unless trivial (e.g., a `Schema` definition).
- **Gateway port** — a `Context.Tag` paired with an interface listing the methods the adapter implements. Lives in `gateways/<system>/port.ts`.
- **Gateway adapter** — `Layer.effect(Tag, …)` constructing the live implementation. Lives in `gateways/<system>/http-adapter.ts`. Depends on `HttpClient`, `ServerEnv`, possibly other gateways.
- **Application service** — one file per use-case, exporting an `Effect<A, E, R>`. Lives in `contexts/<name>/application/<use-case>.ts`. The `R` channel reflects the gateway Tags + config Tags it depends on.
- **Wire boundary mapper** — the single `toWire(program, errorSchema)` helper. The only place Effect values become JSON.
- **Server-function handler** — `createServerFn(...).handler(...)`. The only place `appRuntime.runPromise(...)` is called.

The word "service" alone is never used.

### Dependency law (server-specific)

Allowed edges (additive to the client rules in the existing CONTEXT-MAP):

- `server/server-functions/<name>` → `server/contexts/<name>/application` + `server/runtime` + `server/wire`
- `server/contexts/<name>/application` → `server/contexts/<name>/{domain, errors, config}`, `server/gateways/<X>/port`, `server/gateways/<X>/types`, `server/gateways/<X>/errors`, `server/runtime/server-env`
- `server/gateways/<X>/http-adapter` → `server/gateways/<X>/{port, types, errors}`, `server/runtime/server-env`, `effect`, `@effect/platform`
- `server/wire/to-wire` → `effect`
- `server/runtime/*` → `effect`, `@effect/platform`

Forbidden edges (enforced by `dependency-cruiser`):

- `server/contexts/A → server/contexts/B` for any A ≠ B
- `server/gateways/<X>/<adapter> → server/gateways/<Y>/...` (gateway adapters don't depend on other gateways)
- `server/contexts/<name>/* → @tanstack/react-*` (no client framework imports on server)
- `effect` imported anywhere in `src/contexts/`, `src/widgets/`, `src/coordinator/`, `src/routes/`, `src/kernel/` (Effect is server-only)
- `neverthrow` imported anywhere in `src/server/` (neverthrow is client-only)

### View-model contract (cross-reference)

The server has no view-model layer. View-models are client-side; the server returns Schema-encoded JSON the client unwraps via neverthrow.

### Result types

`Effect<A, E, R>` throughout. `E` is a union of `Schema.TaggedError` classes. The wire mapper turns `Effect<A, E>` into `{ ok: true, ...A } | { ok: false, error: { _tag, ...payload } }` JSON via `Schema.encodeUnknownSync(errorUnion)`.

### Component patterns

The server has no component layer. (For the record: the client owns `widgets/` and `design-system/`; the server has neither.)

### Governance kit (server additions)

Existing tools (`oxlint`, `dependency-cruiser`, `npx fallow`, `ts-pattern.exhaustive()` on the client, `@effect/vitest` on the server) cover their concerns. New rules added to `.dependency-cruiser.cjs` from inception:

- `no-effect-on-client` (error)
- `no-neverthrow-on-server` (error)
- `no-cross-context-server` (error from inception, mirroring client rule)
- `no-cross-gateway-adapter` (error from inception)
- `gateway-adapter-must-import-effect-platform` (informational, becomes error at lockdown)

### Migration phasing

| Phase                                        | Scope                                                                                                                                                                                                                                                                                                                                                                                                                             | Output                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **0 — Foundation** (one PR)                  | Install `effect`, `@effect/platform`, `@effect/platform-node` (or fetch-based runtime adapter), `@effect/vitest`. Scaffold `server/gateways/`, `server/contexts/{board, detail, capture, review}/`, `server/runtime/`, `server/wire/`, `server/server-functions/`. Build `ServerEnvLive`, empty `appLayer`, `appRuntime`, `toWire` helper with unit tests. Add new `dependency-cruiser` rules. **No behaviour change.**           | Reviewable infrastructure PR. e2e green.                    |
| **1 — Board exemplar**                       | Port Jira gateway to `server/gateways/jira/` (port Tag, HTTP adapter Layer, adapter tests with fake `HttpClient`). Port `loadBoard` to `server/contexts/board/application/load-board.ts`. Port the relevant server function to `server/server-functions/board.ts` using `appRuntime.runPromise(toWire(...))`. Pure modules co-locate per their owner. Write `server/contexts/board/CONTEXT.md`.                                   | Working end-to-end vertical slice. The exemplar. e2e green. |
| **2 — Detail context**                       | Port `loadIssue`, `loadTransitions`, `performTransition` to `server/contexts/detail/application/`. Server functions migrated. Reuses Jira gateway from Phase 1. Write `server/contexts/detail/CONTEXT.md`.                                                                                                                                                                                                                        | Detail done.                                                |
| **3 — Capture context**                      | Port `quickCreate` to `server/contexts/capture/application/`. Demonstrates Zod-at-the-boundary (server-function input validation) + Schema-internal use-case (further validation). Reuses Jira gateway. Write `server/contexts/capture/CONTEXT.md`.                                                                                                                                                                               | Capture done; Zod/Schema boundary lesson lands.             |
| **4 — Review context (GitLab introduction)** | Port GitLab gateway to `server/gateways/gitlab/` (port + adapter + tests). Port `getMrStatuses` and `getReviewCards` to the appropriate contexts (`contexts/board/application/` for the MR overlay; `contexts/review/application/` for the review queue). Cross-namespace coupling resolved: Review's application service depends on `JiraGateway` and `GitlabGateway` ports as peers. Write `server/contexts/review/CONTEXT.md`. | Review done; cross-system orchestration lesson lands.       |
| **5 — Lockdown**                             | Delete old `server/jira/` and `server/gitlab/` folders. `dependency-cruiser` rules to `error`. Update `docs/architecture.svg`.                                                                                                                                                                                                                                                                                                    | Old paths gone. Architecture fully enforced.                |
| **6 — Documentation**                        | Write `docs/adr/0005-effect-server-architecture.md` (omnibus). Append "Server architecture (Effect-TS pass)" section to `CONTEXT-MAP.md`. Extend `docs/tour.md` with the server-side trace. Extend `docs/layers.md` with server-layer examples. Add ADR-0004 addendum.                                                                                                                                                            | Manga's server chapter complete.                            |

Feature freeze on the server during migration. Cohabitation period bounded by Phases 1–4. e2e harness (ADR-0001) is the safety net throughout.

### Documentation deliverables

- `.agents/prds/effect-server-refactor.md` — this file (now).
- `docs/adr/0005-effect-server-architecture.md` — omnibus ADR (now, alongside this PRD).
- `CONTEXT-MAP.md` — "Server architecture (Effect-TS pass)" section appended (now).
- `docs/adr/0004-neverthrow-client-effect-server.md` — one-paragraph addendum acknowledging team-template pedagogy is the dominant driver (now).
- `server/contexts/<name>/CONTEXT.md` — per-context, written during each phase's migration.
- `docs/tour.md` — server-side trace appended in Phase 6.
- `docs/layers.md` — server-layer sections added in Phase 6.

### Library additions

- `effect` (runtime).
- `@effect/platform` + `@effect/platform-node` (or the fetch-based adapter ships in core; pin the version that's current at Phase 0). Runtime.
- `@effect/vitest` (dev).

Explicitly _not_ adopted:

- `@effect/sql`, `@effect/sql-pg`, `@effect/sql-sqlite-node` — reserved for the future `code-health` context, out of scope this refactor.
- `@effect/cli` — no CLI on the server today.
- A separate metrics exporter (Prometheus, OTel) — observability deferred per Q12 menu.

## Testing Decisions

### What makes a good test

- Tests assert the **port contract** of a layer, not its internal structure. Layer-based fakes survive any reshape that preserves the gateway's port interface.
- Pure-function modules (domain) are tested with table-driven input/output; no Effect.
- HTTP adapter modules are tested by faking `HttpClient.HttpClient` via `Layer.succeed(...)` against canned wire responses; the adapter's job is to map wire to gateway-output types and to surface the right tagged errors.
- Application-service modules are tested by faking each gateway port via `Layer.succeed(JiraGateway, fakeJira)`; assertions cover the returned `Effect`'s success channel (via `Effect.runPromise`) or its tagged error channel (via `Effect.flip`).
- The wire boundary mapper is directly unit-tested over known programs producing known JSON shapes.
- Server-function handlers are not unit-tested; the e2e harness (MSW Node, ADR-0001) covers them through the wire shape.
- TestClock is the testing primitive of choice when fiber-based or schedule-based code is introduced (deferred until `code-health` ingestion).

### Modules to test (Vitest + `@effect/vitest`)

- **Every domain module** in `contexts/<name>/domain/`. Direct input/output, table-driven over edge cases.
- **Every gateway HTTP adapter** in `gateways/<system>/`. Constructed with `Layer.succeed(HttpClient.HttpClient, fakeClient)`; assertions cover wire-to-types mapping + error tagging.
- **Every application service** in `contexts/<name>/application/`. Constructed with `Layer.succeed(GatewayTag, fake)` for each gateway dependency; assertions cover success and tagged-error paths.
- **The wire boundary mapper** in `wire/to-wire.ts`. Direct unit tests over input `Effect`, output JSON.
- **`ServerEnv` validation** in `runtime/server-env.ts`. Today's `env.test.ts` pattern survives; the table-driven validation is unchanged in spirit, expressed as Schema-decoded ENV.

### What survives, what changes

- The existing **e2e harness** (Playwright + MSW Node, ADR-0001) is untouched. It tests through the wire shape; Effect-vs-Promise internals are invisible.
- Existing **pure-module tests** (`mr-key-map`, `mr-status`, `quick-create-schema`) move with their modules to new homes via `git mv` + import-path updates. No semantic changes.
- Existing **gateway adapter tests** (today: fake `fetch` injection via `Deps.fetch`) **change** to `Layer.succeed(HttpClient.HttpClient, fakeClient)`. The fake-fetch indirection is retired.
- Existing **service tests** (today: hand-rolled fake gateway) **change** to `Layer.succeed(GatewayTag, fake)` with `it.effect("...", () => program)`. The hand-rolled fakes themselves survive — the _injection mechanism_ changes.
- New: **wire boundary mapper tests**.
- New: **`__fixtures__/` convention on the server** — hand-rolled fakes signalled by the double-underscore prefix; `dependency-cruiser` rule already in place from the client refactor.

### Prior art in this codebase

- Hand-rolled fake-pattern at the gateway level: `JiraGateway` / `GitlabGateway` ports with `createHttpJiraGateway` / `createHttpGitlabGateway` adapters; tests inject a fake gateway implementing the same interface. The new architecture **preserves the spirit** (hand-rolled fakes against port interfaces) and **changes the mechanism** (Layer-based injection via `Layer.succeed(Tag, fake)`).
- Pure-module tests collocated as `*.test.ts` next to `*.ts`: pattern continues unchanged.
- ADF renderer snapshot tests: continue as-is.

## Out of Scope

- **The `code-health` context.** Coverage and lint trend indicators on cards are anticipated growth, informing shape choices (DB as system of record per Q3, scheduled in-process pull per Q4, two application surfaces per context per Q4 sub-decision) but **not built** in this refactor. The architecture accepts `gateways/db/`, `gateways/ci/`, and `contexts/code-health/` cleanly when the feature lands.
- **Database adoption (`@effect/sql`, Drizzle, Kysely, etc.).** Reserved for the `code-health` work.
- **Observability backends (OTel, Honeycomb, Prometheus).** Tracer with console-only exporter is in; remote backends are upgrade paths.
- **Effect Metrics.** Deferred until the first metric is worth measuring.
- **Multi-tenancy / per-request credentials.** Today's single-tenant env-loaded credentials stay; the DI design accommodates request-scoped layers if/when multi-tenancy lands.
- **A Java / Go / Rust port of the server.** The architecture is _designed for_ portability via port + adapter at every external system; an actual port is out of scope.
- **Visual / UX changes**, **build-system changes**, **tightening TypeScript strictness beyond today's level**. All inherited as out-of-scope from the client refactor PRD.

## Further Notes

- The strongest team-template lesson is the **two-axis organising principle** (gateways for I/O, contexts for use-cases) plus the **menu-with-upgrade-path** framing of policy decisions (retry / timeout / concurrency / observability). Both are detail other Effect templates miss.
- The **divergence from the client's per-context port-view rule** is itself a teaching moment: hexagonal architecture's "consumer owns the interface" rule pays off when consumers have conceptually different views (typical on the client); shared ports pay off when the methods are atomic I/O with identical signatures (typical on the server). The distinction matters more than the rule.
- **Server contexts may not mirror client contexts 1:1.** This refactor's contexts (board, detail, capture, review) all do; future server-only contexts (anticipated: `code-health`) do not. The rule is "server contexts are use-case clusters, sometimes a UI-surface mirror, sometimes purely server-owned."
- The migration is sized at roughly one focused week of solo work, smaller than the client refactor's similar week. The cohabitation period is bounded by Phases 1–4.
- The architecture **explicitly trades minimalism for legibility** on the server too. Some patterns (Layer-based DI on gateways that today work with factory closure; Schema-tagged errors on errors that today are plain discriminated-union strings; per-context error union schemas where one app-wide schema would compile) are pedagogical, not strictly load-bearing. The `CLAUDE.md` "Simplicity First" retirement on the client extends to the server during this initiative.
- ADR-0004 is updated with a one-paragraph addendum: the _proximate_ reasons (composable async, retries, fiber cancellation, DI) hold and have not changed; the _ultimate_ reason is team-template pedagogy. The pedagogy commitment is what justifies full Layer-based DI, `@effect/platform`, `Schema.TaggedError`, and the menu-of-policies framing — all of which are larger surface area than minimum-Effect-as-better-Promise would require.

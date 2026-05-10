# Effect-TS server architecture: DI, schemas, HTTP, errors, wire, ports, policies

clashboard's server is rewritten on **Effect-TS** with full **Layer-based dependency injection**, **`@effect/platform`'s `HttpClient`**, **`Schema.TaggedError`** for error definitions, and a thin **wire boundary mapper** that converts internal `Effect<A, E>` into the JSON shape the client unwraps via neverthrow (per ADR-0004). Source is organised on two orthogonal axes: `server/gateways/<system>/` for I/O ports and adapters, `server/contexts/<name>/` for use-case clusters. A single `ManagedRuntime` lives at process scope; TanStack Start `.handler`s call `appRuntime.runPromise(toWire(programForThisCall, errorSchema))`.

The proximate driver (composable async, retries, fiber cancellation, structured DI) is real but secondary. The ultimate driver is **team-template pedagogy** — clashboard is the worked example for the team's portfolio, and the server side currently teaches almost nothing about how a TypeScript Effect codebase should be structured. The architecture is the lesson; "minimum Effect to fix today's pain" would not earn that lesson. ADR-0004 receives a one-paragraph addendum acknowledging this.

## Considered Options

- **Effect-as-better-Promise (factory pattern preserved, `R = never` everywhere).** Gateways stay as today's `createHttpJiraGateway(deps)` factories returning objects whose methods produce `Effect<A, E, never>`. _Rejected:_ throws away the DI half of the case for adopting Effect; the singleton-cache pattern in `server-functions.ts` remains; the team-template shows Effect-flavoured factory code, not Effect's actual idiom.
- **Multiple focused ADRs (one per major decision).** _Rejected:_ the decisions are interlinked (DI shape, port granularity, wire mapper, Schema adoption, error definitions all reference each other). Splitting them creates heavy cross-referencing and loses the coherence of the design as a single read.
- **Per-context port views (mirror client rule on server).** Each context declares its own port interface narrowed to the methods it uses; the adapter satisfies all per-context interfaces. _Rejected:_ the client rule's load-bearing reason is that contexts have _conceptually different views_ of a gateway. Server gateway methods are atomic I/O operations with identical signatures across consumers — per-context views split a flat list arbitrarily, duplicating canonical signatures, without revealing different consumer perspectives. The honest team-template lesson is that the rule's applicability depends on whether consumer views differ in shape.
- **`server/kernel/` mirroring `src/kernel/`.** _Rejected:_ the client `kernel/` exists partly to wall off `~/server/...` re-exports; the server has no equivalent need. Cross-context types on the server are predominantly gateway-output types and belong with the gateway that produces them. A `server/kernel/` would be cargo-culting the structural mirror without the load-bearing rationale.
- **`@effect/schema` everywhere on the server, including replacing Zod for `quickCreateSchema`.** _Rejected:_ `quickCreateSchema` crosses the client/server boundary (TanStack Form on the client uses the Zod schema; the server's input validator re-parses with the same schema). Pulling Zod out of the client mid-server-refactor is out-of-scope creep on a finished refactor. The split rule "Zod at the client-crossing boundary, Schema for server-internal validation" is the structurally honest answer.
- **Adopt `@effect/platform`'s `HttpClient` _and_ full observability stack (Tracer with OTel, Metrics with Prometheus) from day one.** _Rejected:_ observability without consumers is noise. Metrics aggregated to a console reporter teach nothing useful. The team-template's observability lesson is _"adopt observability piece-by-piece as the system actually demands it,"_ expressed as menus with chosen point + upgrade path.
- **Effect-TS server architecture as documented here (selected).** Layer-based DI throughout; `@effect/platform`'s `HttpClient`; `Schema.TaggedError`; shared port per gateway with documented divergence from the client rule; one omnibus ADR; menu-with-upgrade-path framing of policy decisions; gateway-output types co-located with gateways (no `server/kernel/`).

## Folder layout

```
src/server/
├── runtime/             ServerEnv Tag + Layer; appLayer; appRuntime (ManagedRuntime)
├── wire/                toWire(program, errorSchema) helper
├── gateways/<system>/   port (Tag + interface), http-adapter (Layer), types, errors
├── contexts/<name>/     domain/, application/, errors, config, CONTEXT.md
└── server-functions/    createServerFn(...).handler(() => appRuntime.runPromise(toWire(...)))
```

`server/contexts/` mirrors `src/contexts/` for the four UI-surface contexts (`board`, `detail`, `capture`, `review`). Future server-only contexts (anticipated: `code-health`) live alongside without a client mirror. `server/kernel/` is **not** introduced; cross-context types live with the gateway that produces them.

## Layer vocabulary (server side)

| Layer                       | What it is                                                                                                           | What it knows                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------- |
| **Domain**                  | Pure functions over gateway-output types and primitives.                                                             | Domain rules.                                                                                  |
| **Gateway port**            | `Context.Tag` + interface listing methods the adapter implements.                                                    | The external API contract (or the DB API contract).                                            |
| **Gateway adapter**         | `Layer.effect(Tag, ...)` with `HttpClient` (or DB driver) inside.                                                    | The wire format of the external system; HTTP error mapping.                                    |
| **Application service**     | One file per use-case, exporting `Effect<A, E, R>`. The `R` channel is the gateway Tags + config Tags it depends on. | Its context's gateways + config + domain.                                                      |
| **Wire boundary mapper**    | `toWire(program, errorSchema)` converting `Effect<A, E>` to `{ ok: true, ...A }                                      | { ok: false, error: { \_tag, ...payload } }`.                                                  | `effect/Schema` only. |
| **Server-function handler** | `createServerFn(...).handler(() => appRuntime.runPromise(toWire(...)))`. The composition root for one request.       | TanStack Start, `appRuntime`, the program for this request, the error schema for this request. |

The word "service" alone is never used.

## Dependency law (server)

Allowed edges (additive to the client rules):

- `server/server-functions/<name>` → `server/contexts/<name>/application` + `server/runtime` + `server/wire`
- `server/contexts/<name>/application` → `server/contexts/<name>/{domain, errors, config}`, `server/gateways/<X>/{port, types, errors}`, `server/runtime/server-env`
- `server/gateways/<X>/http-adapter` → `server/gateways/<X>/{port, types, errors}`, `server/runtime/server-env`, `effect`, `@effect/platform`
- `server/wire` → `effect`
- `server/runtime/*` → `effect`, `@effect/platform`

Forbidden (codified as `dependency-cruiser` rules):

- `server/contexts/A → server/contexts/B` for any A ≠ B
- `server/gateways/<X>/<adapter> → server/gateways/<Y>/...` (gateway adapters don't depend on other gateways)
- `effect` imported anywhere in `src/contexts/`, `src/widgets/`, `src/coordinator/`, `src/routes/`, `src/kernel/` (Effect is server-only)
- `neverthrow` imported anywhere in `src/server/` (neverthrow is client-only)

The rule about **shared ports per gateway** is the team-template's nuance lesson on hexagonal architecture: per-context port views pay off when consumers have _conceptually different views_ of a gateway (typical on the client); shared ports pay off when methods are _atomic I/O operations with identical signatures across consumers_ (typical on the server). The rule depends on what kind of consumer surface the gateway actually has, not on a one-size-fits-all heuristic.

## Schema and error definitions

- `effect/Schema` for **server-internal** validation: HTTP response shapes (`HttpClientResponse.schemaBodyJson(WireResponse)`), internal codecs, ingestion payloads when they arrive, encoder for the wire boundary mapper.
- **Zod retained** for any schema crossing the client/server boundary. Today: only `quickCreateSchema`. Tomorrow: any new schema where the same shape is consumed by both TanStack Form on the client and the server's `inputValidator`.
- Tagged errors are `Schema.TaggedError` classes:
  ```ts
  class Unauthorized extends Schema.TaggedError<Unauthorized>()('Unauthorized', {}) {}
  class Rejected extends Schema.TaggedError<Rejected>()('Rejected', { message: Schema.String }) {}
  ```
  `Effect.catchTag` and `Effect.matchTags` work first-class; `Schema.encodeUnknownSync(SomeErrorUnion)` produces the `{ _tag, ...payload }` JSON the client unwraps via neverthrow without a hand-written serializer.

## The wire boundary mapper

One shared helper in `src/server/wire/to-wire.ts`:

```ts
export const toWire = <A, E>(
  program: Effect.Effect<A, E, never>,
  errorSchema: Schema.Schema<E, unknown>,
): Effect.Effect<WireResult<A>, never, never> =>
  program.pipe(
    Effect.match({
      onSuccess: (value) => ({ ok: true as const, ...value }),
      onFailure: (error) => ({
        ok: false as const,
        error: Schema.encodeUnknownSync(errorSchema)(error),
      }),
    }),
    Effect.catchAllDefect(/* log + return { ok: false, error: { _tag: 'InternalError' } } */),
  )
```

Each handler passes its **per-context error union schema**, not an app-wide schema. Adding a new error tag to a handler's error union is a compile error visible at the handler. Success-side encoding is **pass-through** for Phase 1 (today's success types are JSON-flat); the upgrade to `Schema`-encoded success lands when types get richer (anticipated: `Date` snapshots in the future `code-health` context). The `Effect.catchAllDefect` arm is the failure-vs-defect distinction the template teaches: expected failures travel the `E` channel; unexpected defects (escaping exceptions, OOMs) bypass the wire mapper unless explicitly caught and demoted to a generic tagged shape.

## Policy menus (retry, timeout, concurrency, observability)

Each policy is documented as a **menu with chosen point + upgrade path** so a future project re-running this design conversation can pick a different point on the same menu without re-deriving the trade-offs.

| Policy      | Chosen point (Phase 1)                                                                                                                                                            | Upgrade path                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Retry       | 2 attempts, exponential backoff (100→200→400ms), transient only (network errors + 502/503/504), wired as `HttpClient.layer` middleware. 4xx fails fast (preserves wire contract). | Per-call `Effect.retry(customSchedule)` overrides; per-gateway retry policies if a system needs different defaults.                        |
| Timeout     | 10s default per HTTP call, wired as `HttpClient.layer` middleware.                                                                                                                | Per-call `Effect.timeout("30 seconds")` for known-slow operations.                                                                         |
| Concurrency | `Effect.all(arr, { concurrency: 5 })` at the application-service level for fan-outs.                                                                                              | Per-gateway `RateLimiter` Layer when Jira's 100 req/min limit gets hit in practice. The application services do not change in the upgrade. |
| Logger      | Adopted fully. `Logger.pretty` in dev, structured JSON in prod, wired as a Layer.                                                                                                 | None needed at clashboard's scale.                                                                                                         |
| Tracer      | Adopted with **console-only exporter**. `Effect.gen` blocks become spans automatically; `Effect.withSpan(...)` for explicit ones.                                                 | Swap exporter Layer to OTel/Honeycomb/Jaeger when production demands; code does not change.                                                |
| Metrics     | **Deferred.** No exporter, no consumer.                                                                                                                                           | Adopt with appropriate exporter when the first metric is worth measuring (anticipated: `code-health` ingestion failure rate).              |

## Tests

- Hand-rolled fakes provided via `Layer.succeed(Tag, fake)`. **No `vi.mock` of internal modules** (mirrors the client rule, expressed via Effect's mechanism).
- `@effect/vitest` adopted from the start: `it.effect("...", () => program)` is the canonical test idiom. `Effect.runPromise` is not visible in test bodies.
- Gateway HTTP adapter tests fake `HttpClient.HttpClient` via `Layer.succeed(...)` against canned wire responses. The `Deps.fetch` injection of today's tests is retired.
- Application-service tests fake gateway Tags via `Layer.succeed(JiraGateway, fake)`. Hand-rolled fakes live in `__fixtures__/` per context. `Effect.flip` exposes the tagged error channel for assertion.
- The wire boundary mapper is directly unit-tested over known programs producing known JSON shapes.
- Server-function handlers are not unit-tested; the e2e harness (MSW Node + Playwright per ADR-0001) covers them through the wire shape.
- TestClock is the canonical primitive for fiber/schedule tests; not exercised in this refactor (no scheduled work yet) but is the documented pattern when ingestion lands.

## Migration phasing

Six phases: **0 — Foundation** (deps, scaffolding, runtime, `toWire`, dep-cruiser rules), **1 — Board exemplar** (Jira gateway end-to-end through every server layer), **2 — Detail context**, **3 — Capture context** (the Zod-at-boundary + Schema-internal lesson), **4 — Review context** (GitLab gateway introduction; cross-namespace coupling resolved), **5 — Lockdown** (delete old folders; rules to `error`), **6 — Documentation** (this ADR was drafted at the start; tour/layers extensions land here).

Cohabitation period (`server/jira/` + `server/gateways/jira/` both in `master`) bounded by Phases 1–4. Feature freeze on the server during the refactor. e2e harness is the safety net throughout.

## Consequences

- **`server/jira/{gateway, http-gateway, issue-service, server-functions}.ts` and `server/gitlab/{gateway, http-gateway, mr-service, review-service, server-functions}.ts` are deleted at lockdown.** Their content lives, restructured, in `server/gateways/{jira, gitlab}/` (port + adapter + types + errors) and `server/contexts/{board, detail, capture, review}/application/` (one file per use-case).
- **`server/env.ts`'s lazy singleton becomes `ServerEnvLive: Layer<ServerEnv>`.** `getServerEnv()` callers retire; everything uses `yield* ServerEnv` in an Effect. Validation runs once at app startup and fails fast.
- **The cross-namespace coupling smell (`gitlab/review-service.ts → JiraIssueService`) disappears.** `server/contexts/review/application/load-review-cards.ts` depends on `JiraGateway` and `GitlabGateway` Tags as peers; neither gateway depends on the other.
- **`JiraResult<T>` and `GitlabResult<T>` discriminated-union types are deleted.** Their place is taken by `Effect<A, E>` where `E` is a `Schema.TaggedError` union. The wire shape (`{ ok, ... }` or `{ ok: false, error: { _tag, ... } }`) is unchanged for the client.
- **Gateway adapter tests change mechanism**: from `Deps.fetch` injection to `Layer.succeed(HttpClient.HttpClient, fakeClient)`. Coverage is preserved; the seam is now Effect's.
- **Service-layer tests change mechanism**: from hand-rolled-fake-gateway-passed-as-arg to `Layer.succeed(GatewayTag, fake)` provided to an `it.effect` body. The fakes themselves survive — only the injection mechanism changes.
- **One new test category — wire boundary mapper tests.** Direct unit tests over `toWire`.
- **`appRuntime` is process-scoped, not per-request.** Layer construction (and therefore `ServerEnv` validation, `HttpClient` configuration, retry/timeout middleware composition) happens once at startup. Per-request cost is `runPromise` only.
- **The team-template earns three teaching moments on policy composition**: (1) `HttpClient.layer` for cross-cutting policies (retry, timeout); (2) application-service composition for use-case-specific policies (concurrency in fan-outs); (3) per-call overrides as the escape hatch (`Effect.retry(customSchedule)`, `Effect.timeout("30s")`, `concurrency: N` on a specific `Effect.all`).
- **The team-template earns the team's clearest example yet of where the client rule diverges from the server rule and why** — shared port per gateway, no `server/kernel/`, server contexts that need not mirror client contexts. The divergences are not inconsistencies; they are the rule applied at the right granularity for each side's actual problem.
- **The architecture accepts the future `code-health` context cleanly.** `gateways/db/` (port + adapter for the database) and `gateways/ci/` (port + adapter for CI metric pulls) slot into the existing `gateways/` axis. `contexts/code-health/application/` exposes both a _read_ surface (used at render) and an _ingest_ surface (run on a schedule via `Effect.fork(ingest.pipe(Effect.repeat(Schedule.fixed("5 minutes"))))`). The two-application-surface pattern is the canonical template for any future server-owned context.
- **`CLAUDE.md`'s "Simplicity First" retirement (already in effect on the client) extends to the server during this initiative.** Some patterns chosen here (full Layer-based DI on gateways that today work with factory closure; `Schema.TaggedError` where plain class-with-`_tag` would compile; per-context error union schemas where one app-wide schema would compile) are pedagogical, not strictly load-bearing. They are the worked example, not the minimum.

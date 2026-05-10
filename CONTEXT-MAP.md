# clashboard — context map

clashboard is organised as **bounded contexts**, each with its own internal hexagon (domain logic / application service / adapters / presentation). The contexts are intentionally small — clashboard is a viewer, not a system of record — but the boundary lines are real and enforced.

## Contexts

| Context     | Lives in                | Purpose                                  | Key concepts                                                             |
| ----------- | ----------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| **Board**   | `src/contexts/board/`   | Renders my work as columns               | `BoardView`, `Column`, status-mapping, deemphasis, sort, filter          |
| **Detail**  | `src/contexts/detail/`  | Renders a single ticket in a side panel  | `IssuePanelState`, ADF rendering, sibling navigation, keyboard shortcuts |
| **Review**  | `src/contexts/review/`  | Surfaces MRs waiting on me as fake cards | `ReviewCard`, review-state buckets                                       |
| **Capture** | `src/contexts/capture/` | Quick-create modal                       | `QuickCreateInput`, parent selection, type segmentation                  |

The **Board** and **Review** contexts both place items on the same column grid, so they share _Column_ as kernel terminology. **Detail** and **Capture** are independent surfaces that compose with Board.

There is no top-level "domain layer" above the contexts. clashboard's domain _is_ the set of contexts; cross-cutting concepts (`IssueKey`, status-name strings) are kernel types, not entities.

## Cross-context coordination

Some workflows span contexts and don't belong inside any one of them:

- **Apply transition** — Board patches its cache, Detail patches its cache, gateway is called, both roll back on failure. Touches Board + Detail.
- **Handle MR merged** — Detail/Review surface the action; Board needs the resulting transition reflected. Touches Review + Board (+ Detail).
- **Create issue** — Capture submits; Board invalidates so the new card appears.

These live in a **cross-context coordinator** (`src/coordinator/`). The coordinator depends on per-context application services; contexts never depend on the coordinator.

## Layer vocabulary (shared by every context)

The word "service" was overloaded in earlier code (`JiraIssueService` server-side, `DashboardService` client-side). Going forward, each layer has a distinct name; "service" alone is never used.

| Layer                   | What it is                                                                                                                                                                                   | What it knows                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Domain logic**        | Pure functions over kernel types. No I/O, no time, no framework.                                                                                                                             | Domain rules only.                                            |
| **Gateway**             | Port + adapter to an external system.                                                                                                                                                        | The external API contract.                                    |
| **Application service** | Use-cases for one context. Orchestrates domain logic via gateway/cache ports. Framework-free factory.                                                                                        | Its own context's gateways, caches, clocks, and domain logic. |
| **View-model**          | Framework-free state machine + derivation: `(state, event) → state` plus `(state, queryData, selection) → DisplayState`. Built on `ts-pattern` for exhaustive matching. **No React import.** | Application service results + UI inputs.                      |
| **Presenter**           | Thin React adapter binding the view-model to the framework. The only place TanStack Query, TanStack Router, and DOM listeners appear for a given screen.                                     | React, TanStack Query, TanStack Router, view-model.           |
| **View**                | React components.                                                                                                                                                                            | Presenter output + design-system primitives.                  |
| **Coordinator**         | Cross-context workflows.                                                                                                                                                                     | Multiple application services.                                |

Dependency direction is strict: **view → presenter → view-model → application service → (gateway port, cache port, domain logic)**. The coordinator sits above application services. No layer reaches sideways into another context's internals; cross-context use happens through the coordinator or through declared kernel types.

### React-decoupling commitment

Every non-trivial screen splits into `view-model.ts` (plain TS, framework-free) + `use-*.ts` (presenter, React-bound). The view-model is portable across React, Svelte, Vue, Solid; only the presenter and view get rewritten when the framework changes. This is the success criterion for the framework-decoupling claim — verifiable by porting one screen to Svelte without touching its view-model.

Trivial hooks (one piece of `useState`, no derivation) stay as plain hooks. The view-model split applies when state shape is non-trivial (a discriminated state machine, derivation across multiple inputs, or testable behaviour beyond "stores a value").

**TanStack Query and TanStack Router are _adapters_** — visible to presenters only. View-models receive query results as plain values and `navigate` as an injected function; they never call `useQuery` / `useNavigate` themselves.

## Glossary (in-progress — extend as terms get resolved)

- **BoardView** — the projection of my issues + review cards onto the four columns. Owned by Board context.
- **WorkItem** _(candidate term — not yet adopted)_ — a thing on the board, regardless of source (Jira issue or GitLab MR fake-card). Currently modelled as a discriminated union at the assembly layer; not a first-class type.
- **Coordinator** — the cross-context workflow object (formerly the misnamed `DashboardService`).
- **Application service** — the use-case layer of one context. Replaces the overloaded "service."
- **Gateway** — the port to an external system. The HTTP gateway adapter implements the port.
- **View-model** — framework-free state machine for one screen / one widget. Replaces the React-bound "hook returns a state" pattern where the state shape is non-trivial.
- **Presenter** — the React-bound thin shell over a view-model. Where React-Query / Router / DOM listeners are wired in.

## The kernel module

The client owns its types via `~/kernel/`, which re-exports gateway-output types and server-function result types from `~/server/...`. Presenters / view-models / views never reference `~/server/...` directly — only `~/kernel/` does.

```
src/kernel/
├── jira.ts     # re-exports BoardIssue, DetailIssue, ... from ~/server/gateways/jira and the server-function result types from ~/server/server-functions/{board,detail,capture}
├── gitlab.ts   # re-exports MrSummary, ReviewCard, ... from ~/server/gateways/gitlab and the server-function result types from ~/server/server-functions/{board,review}
├── columns.ts  # Column / columnForStatus / statusesForColumn / isDeemphasized / COLUMNS
├── status.ts   # normalizeStatus
├── review.ts   # reviewCardId / reviewBucketColumn / reviewSearchHaystack / REVIEW_BUCKET_STATUS_NAME
├── mr/         # REVIEWER_STATE_LABEL / REVIEWER_BADGE_LABEL / CiVisualState / ReviewerVisualState
└── index.ts
```

Kernel types are the lingua franca of cross-context dependencies (e.g. both Board and Detail can refer to a `BoardIssue` without either context owning the type).

## Libraries and idioms

| Concern                  | Choice                                | Rule                                                                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pattern matching         | `ts-pattern`                          | Canonical across application services, view-models, and views. Existing `if`/`else if` ladders migrated retroactively. `.exhaustive()` on every match.                                                                                                                 |
| Client result type       | `neverthrow`                          | All `Promise<{ ok: ... }>` shapes become `ResultAsync<T, E>`; `E` is a hand-rolled tagged-error class (e.g. `class Unauthorized { readonly _tag = 'Unauthorized' }`). Match via `result.match({ Ok, Err })` or unwrap to a discriminated union and ts-pattern over it. |
| Server result type       | `Effect` (server pass — see ADR-0005) | `Effect<A, E, R>` throughout server code. `E` is a union of `Schema.TaggedError` classes. Wire format unchanged: tagged JSON the client unwraps via neverthrow.                                                                                                        |
| Form schemas             | Zod 4                                 | Already in.                                                                                                                                                                                                                                                            |
| Forms                    | TanStack Form                         | Already in.                                                                                                                                                                                                                                                            |
| Cache                    | TanStack Query                        | Adapter behind the `Cache` port; only presenters (and the coordinator's adapter) import `useQuery`/`useMutation`.                                                                                                                                                      |
| Routing                  | TanStack Router                       | Adapter; `useNavigate` only in presenters; the `navigate` function is passed into view-models / coordinator as a dep.                                                                                                                                                  |
| Toasts                   | sonner                                | Adapter behind a `Toast` port owned by the coordinator. View-models and application services do not import `sonner`.                                                                                                                                                   |
| Design-system primitives | Shadcn/ui (already configured)        | **Adopt-on-second-use** rule: when a primitive (button, dialog, popover, ...) is needed in 2+ places, pull in the shadcn version into `design-system/`. Single-use primitives stay inline at first.                                                                    |
| Architecture analysis    | `fallow`                              | Local-only `npx fallow`; reads `.fallow/` cache. Used for unused-code, duplication, complexity, and architecture-drift signal.                                                                                                                                         |
| Dependency rules         | `dependency-cruiser`                  | Codifies the dependency law as `forbidden` rules — one rule per edge in `.dependency-cruiser.cjs`. All rules are `error` post-lockdown.                                                                                                                                |

Skipped, with reason:

- `xstate` — view-model machines are too small to justify the runtime; ts-pattern reducers are enough.
- `zustand` / `valtio` / `jotai` — TanStack Query is the cache; `useState` is enough for local state; no separate store layer needed.
- Effect on client — JSON serialisation at the network boundary collapses Effect-shaped values to plain objects regardless. The unification benefit doesn't survive the boundary, so the cost isn't worth it on the client.
- `arktype` / `valibot` — one validator (Zod) is enough.
- `radash` / `remeda` — no widespread utility need.

## Folder layout

```
src/
├── kernel/                # types from server, plus cross-context domain logic
├── contexts/              # one folder per bounded context, each an internal hexagon
│   └── <name>/{domain, application, view-model, presenter, view}
├── widgets/               # reusable visual surfaces with domain meaning
├── coordinator/           # cross-context workflows
├── design-system/         # domain-agnostic primitives
├── routes/                # the only place multiple contexts are wired together
├── lib/                   # framework-level utilities
└── server/                # Effect-TS server (see "Server architecture" below)
    ├── gateways/<system>/   # one folder per external system: port + adapter + types + errors
    ├── contexts/<name>/     # one folder per use-case cluster: application/, domain/, errors, config
    ├── runtime/             # ServerEnv Tag + Layer, appLayer, appRuntime (ManagedRuntime)
    ├── wire/                # toWire(program, errorSchema)
    └── server-functions/    # createServerFn handlers — appRuntime.runPromise(toWire(...))
```

`kernel/` owns cross-context domain logic that previously lived in `features/board/`: `Column` type, `columnForStatus`, `statusesForColumn`, `deemphasize`, status-name normalisation. Board _uses_ these heavily but no longer _owns_ them.

## The dependency law

The import graph is a strict DAG. Edges that exist:

- `routes` → `contexts/<name>` (via barrel), `coordinator/provider`
- `contexts/<name>` → `kernel`, `coordinator`, `widgets/<name>`, `design-system`, `lib`
- `widgets/<name>` → `kernel`, `coordinator`, `design-system`, `lib`, sibling widgets _only_ within the same widget family (e.g. `mr-section` and `fixasap-ribbon` may compose inside `ticket-card`)
- `coordinator` → `contexts/<name>/application` (per-context use-cases), `kernel`, `lib`
- `contexts/<name>/application` → `kernel`, gateway/cache **ports** (declared inside the context)
- `contexts/<name>/domain` → `kernel` only
- `kernel` → `server` (re-export) and itself

Edges that **do not exist** (enforced by fallow / dependency-cruiser):

- `contexts/A` → `contexts/B` for any A ≠ B (no sideways context dependencies)
- `widgets/A` → `contexts/<any>` (widgets never depend on contexts)
- `coordinator` → `contexts/<name>/{view, presenter, view-model}` (coordinator only sees application services)
- `contexts/<name>/{domain, application, view-model}` → React, TanStack Query, TanStack Router, sonner, window/document
- `widgets/<name>` → React-Query / Router _outside its own presenter file_

## Component patterns

| Pattern                                                                                    | Where it applies                                                                                                                       | Why                                                                                              |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Compound API** (namespace-style: `Mr.Root` / `Mr.ReviewerRow`)                           | `design-system/` primitives (via shadcn) and `widgets/mr-section` (only place with 2 distinct layouts: card row vs. panel block)       | Compound pays only with multiple consumer layouts; everywhere else it's overhead.                |
| **Subcomponent extraction** (named siblings under `contexts/<name>/view/`)                 | Default refactor for view monoliths: `IssueDetailPanel`, `Board`, etc. Inner components hoisted into siblings of the composition root. | Independent testability, short composition file, no compound plumbing for single-consumer views. |
| **Flat siblings** then sub-folder when > ~5 children                                       | Default placement                                                                                                                      | Avoids premature folder hierarchy.                                                               |
| **Namespace-style compound exports** (`Component.Root = Component; Component.Part = Part`) | Where compound API is justified                                                                                                        | Reads like Radix/shadcn at the call site; manga lesson lands at the consumer.                    |

## Governance: one tool per concern

| Concern                                                                                  | Tool                      | Notes                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code idiom** (jsx-a11y, react-hooks, exhaustive deps, no-array-index-key, unused vars) | `oxlint`                  | Expand from `correctness`/`suspicious`/`perf` to also include the `react`, `react-hooks`, `jsx-a11y`, `import`, `unicorn`, `typescript`, and `pedantic` plugin/category sets. `style` stays off (Prettier's job). |
| **Architecture rules** (the dependency law)                                              | `dependency-cruiser`      | One `.dependency-cruiser.cjs` rule per dependency-law edge. Each rule reads as one sentence. Output: SVG to `docs/architecture.svg`, regenerated at every milestone.                                              |
| **Drift, unused, duplication, complexity**                                               | `fallow` (`npx fallow`)   | Wired into `package.json` scripts and the CI gate.                                                                                                                                                                |
| **Exhaustiveness over discriminated unions**                                             | `ts-pattern.exhaustive()` | Self-enforcing at the match site; no plugin. Adding a new `reason` to a union becomes a compile error in every match.                                                                                             |

ESLint is _not_ adopted: oxlint covers the React / a11y / import idiomatic rules; dependency-cruiser covers what `eslint-plugin-boundaries` would. No plugin gap remains.

TS strictness stays at today's level (`strict`, `strictNullChecks`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`). `exactOptionalPropertyTypes` and `noPropertyAccessFromIndexSignature` are deliberately off — they fight React prop spreading and add friction without proportional bug catch.

### Three CI gates, ordered by speed

| Gate             | When                        | What                                                                                     |
| ---------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| Pre-commit       | every commit (staged files) | `oxlint --staged`, `prettier --check`. Sub-second.                                       |
| Pre-push / PR CI | every push                  | `tsc --noEmit` (both configs), `oxlint`, `depcruise`, `npx fallow`, `vitest run`. ~30 s. |
| Heavy            | nightly / pre-release       | `playwright test`. Multiple minutes.                                                     |

Pre-commit wired via `simple-git-hooks` (config in `package.json`, zero extra deps).

### Architectural rules: graduated

The `dependency-cruiser` rule file starts with what is _already true today_ (e.g. `kernel/` has no incoming app-code edges because the folder doesn't exist yet, but once it does, the rule is enforced from inception). Rules tighten as each context is migrated. The rule file becomes the record of the migration.

The first rules to land:

1. `no-cross-context` — error from inception (the rule that defines the architecture)
2. `no-react-in-domain-application-view-model` — error from inception
3. `no-tanstack-query-outside-presenter` — error from inception
4. `kernel-cant-import-app-code` — error from inception
5. `no-toast-outside-coordinator` — added once `widgets/` and `coordinator/` exist

## Migration plan

Incremental, exemplar-first. Master always works; e2e is the gate at every step. Feature freeze during the refactor.

| Phase                        | Scope                                                                                                                                                                                                                                                                                                                        | Output                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 0 — Foundation (one PR)      | Install `ts-pattern`, `neverthrow`, `dependency-cruiser`, `simple-git-hooks`. Create empty `kernel/`, `contexts/`, `widgets/`, `design-system/`. **Rename `dashboard/` → `coordinator/` early so all subsequent migrations import from `~/coordinator`.** Wire `npx fallow`, `depcruise`, expanded `oxlint`, three CI gates. | No behaviour change. e2e green.     |
| 1 — Board exemplar           | Migrate Board end-to-end: domain → kernel + `contexts/board/domain/`; build new `application/`, `view-model/`, `presenter/`, `view/` layers; subcomponent extraction. Write `contexts/board/CONTEXT.md`.                                                                                                                     | The manga's first lesson. ~4–6 PRs. |
| 2 — Detail                   | Follow exemplar.                                                                                                                                                                                                                                                                                                             |                                     |
| 3 — Capture                  | Follow exemplar. Smallest surface; exercises forms.                                                                                                                                                                                                                                                                          |                                     |
| 4 — Review                   | Follow exemplar. Mostly server-side already.                                                                                                                                                                                                                                                                                 |                                     |
| 5 — Widgets                  | `status-pill`, `ticket-card`, `mr-section`, `fixasap-ribbon` → `widgets/`. Compound API for `widgets/mr-section`. shadcn primitives into `design-system/` as second-use triggers.                                                                                                                                            |                                     |
| 6 — Coordinator finalisation | Adapters extracted (TanStack cache, sonner toast, router navigate, browser window); `Cache` / `Toast` / `Navigate` / `Browser` ports declared.                                                                                                                                                                               |                                     |
| 7 — Lockdown                 | All `dependency-cruiser` rules to `error`; graduated exceptions removed; `architecture.svg` regenerated.                                                                                                                                                                                                                     |                                     |
| 8 — Documentation            | README rewrite, tour doc, layer reference, ADRs filled in.                                                                                                                                                                                                                                                                   |                                     |

Risks bounded by the e2e harness (mocked at HTTP per ADR-0001). Selector renames are mechanical via centralized `lib/testids.ts`. Vitest tests follow modules to their new homes via `git mv` + import-path update.

## Documentation footprint

| Doc                                                      | When                                   | Purpose                                                                                                                             |
| -------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `CONTEXT-MAP.md`                                         | Now (this file)                        | Architectural overview; reader's first stop.                                                                                        |
| `docs/adr/0002-bounded-contexts-and-layer-vocabulary.md` | Drafted at end of grill                | Why bounded contexts replace feature folders; the layer vocabulary; the dependency law.                                             |
| `docs/adr/0003-framework-free-view-models.md`            | Drafted at end of grill                | View-model = framework-free TS reducer; presenter = thin React shell. The proof of the React-decoupling claim.                      |
| `docs/adr/0004-neverthrow-client-effect-server.md`       | Drafted at end of grill                | The JSON-boundary observation; why client and server use different result-type idioms; ts-pattern as the shared matching primitive. |
| `docs/architecture.svg`                                  | Regenerated each milestone             | `depcruise --output-type dot \| dot -Tsvg`; one-glance view of the dependency law.                                                  |
| `contexts/<name>/CONTEXT.md`                             | Per phase, with each context migration | Per-context glossary, use-cases, view-model state machine, public surface. Fixed template.                                          |
| `docs/tour.md`                                           | Phase 8                                | Single trace of "click status pill → transition lands" through every layer. The manga's first chapter.                              |
| `docs/layers.md`                                         | Phase 8                                | Reference: each layer with one annotated example from the migrated codebase.                                                        |
| `README.md` (rewrite)                                    | Phase 8                                | Architecture-first; product PRDs linked as reference.                                                                               |

## Test strategy

One test approach per layer; the testing strategy is the _evidence_ that the architecture is what we claim it is.

| Layer                   | Test approach                                                                                                                                                                                                                         | Mocking                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Domain**              | Direct input/output, table-driven.                                                                                                                                                                                                    | None — pure.                                                                                            |
| **Application service** | Construct with a hand-rolled fake gateway/cache implementing the port interface; assert side-effects + returned `Result`.                                                                                                             | Hand-rolled fakes in `contexts/<name>/application/__fixtures__/`. **No `vi.mock` of internal modules.** |
| **View-model**          | Table-driven `(state, event) → state'` reducer + `(state, queryData, ...) → DisplayState` derivation. ts-pattern `.exhaustive()` covers every branch at compile time. Reducer and derivation share one test file per view-model.      | None — pure.                                                                                            |
| **Presenter**           | Test only when there's behaviour beyond "feed view-model": event listeners, polling, side-effect orchestration. `renderHook` with hand-rolled `WithDeps`. Most presenters do not need a unit test — view-model tests cover the logic. | Hand-rolled `*Deps` object.                                                                             |
| **View**                | No unit tests. Covered by e2e.                                                                                                                                                                                                        | —                                                                                                       |
| **Coordinator**         | Hand-rolled fake context-application-services + fake adapters. Assert orchestration: optimistic patch, await gateway, rollback / commit, toast.                                                                                       | Hand-rolled fakes.                                                                                      |
| **End-to-end**          | Existing harness (ADR-0001): MSW at HTTP boundary; roles + centralised testids. Refactor-stable by design.                                                                                                                            | MSW Node sidecar.                                                                                       |

The pattern of `use-*WithDeps` (hooks accepting injected deps for testing) mostly disappears in the new architecture: the _logic_ moves into framework-free view-models, which are unit-testable directly without `renderHook`. `WithDeps` survives only on presenters that own behaviour beyond the view-model.

The `__fixtures__/` folder convention (double-underscore prefix) signals "test-only" to readers and to `dependency-cruiser` — production code may not import from `__fixtures__/`.

## Server architecture (Effect-TS pass)

The server is rewritten on Effect-TS in a separate pass — see `docs/adr/0005-effect-server-architecture.md` and `.agents/prds/effect-server-refactor.md`. The summary below tracks the as-merged shape; refer to ADR-0005 for full rationale and policy menus.

### Two-axis organising principle

The server is organised on **two orthogonal axes**:

- `src/server/gateways/<system>/` — one folder per external system (`jira`, `gitlab`). Holds the gateway port (`Context.Tag`), HTTP adapter (`Layer`), gateway-output types (cross-context types co-locate here), and gateway-specific tagged errors.
- `src/server/contexts/<name>/` — one folder per use-case cluster (`board`, `detail`, `capture`, `review`). Holds `domain/`, `application/` (one file per use-case), context-specific tagged errors, and a context-specific config Layer.

Server contexts mirror client contexts where the use-case maps to a UI surface. **Future server-only contexts are anticipated** (e.g. `code-health` for coverage/lint trend indicators) and slot into the same `contexts/` axis without mirroring a client context. The lesson: server contexts are use-case clusters, sometimes a UI-surface mirror, sometimes purely server-owned.

### Server layer vocabulary

| Layer                            | What it is                                                                 | What it knows                                                         |
| -------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Domain** (server)              | Pure functions over gateway-output types.                                  | Domain rules.                                                         |
| **Gateway port**                 | `Context.Tag` + interface.                                                 | The external API contract.                                            |
| **Gateway adapter**              | `Layer.effect(Tag, …)` using `@effect/platform`'s `HttpClient`.            | Wire format of the external system; HTTP error mapping.               |
| **Application service** (server) | One file per use-case, exporting `Effect<A, E, R>`.                        | Its context's gateways + config + domain.                             |
| **Wire boundary mapper**         | `toWire(program, errorSchema)` — the only place Effect values become JSON. | `effect/Schema` only.                                                 |
| **Server-function handler**      | `createServerFn(...).handler(() => appRuntime.runPromise(toWire(...)))`.   | TanStack Start, `appRuntime`, the per-request program + error schema. |

The server has no view-model, presenter, view, or coordinator layer (those are client-side). Cross-context composition for _reads_ happens at the server-function layer (the route equivalent on the client).

### Server-side dependency law (additive to client rules)

Allowed:

- `server/server-functions/<name>` → `server/contexts/<name>/application` + `server/runtime` + `server/wire`
- `server/contexts/<name>/application` → `server/contexts/<name>/{domain, errors, config}`, `server/gateways/<X>/{port, types, errors}`, `server/runtime/server-env`
- `server/gateways/<X>/http-adapter` → `server/gateways/<X>/{port, types, errors}`, `server/runtime/server-env`, `effect`, `@effect/platform`
- `server/wire`, `server/runtime/*` → `effect`, `@effect/platform`

Forbidden (codified as `dependency-cruiser` rules):

- `server/contexts/A → server/contexts/B` for any A ≠ B
- `server/gateways/<X>/<adapter> → server/gateways/<Y>/...`
- `effect` imported anywhere in `src/contexts/`, `src/widgets/`, `src/coordinator/`, `src/routes/`, `src/kernel/` — Effect is server-only.
- `neverthrow` imported anywhere in `src/server/` — neverthrow is client-only.

### Divergences from the client rules (with rationale)

| Server                                                                                              | Client                           | Why divergent                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shared port per gateway** (one `JiraGateway` Tag with all methods; contexts choose which to use). | Per-context port views.          | Server gateway methods are atomic I/O operations with identical signatures across consumers; per-context views split a flat list arbitrarily. The client's "consumer owns the interface" rule pays off when consumer views differ in _shape_ (typical there); shared ports pay off when methods are atomic with same signatures (typical here). |
| **No `server/kernel/`** — cross-context types co-locate with the gateway that produces them.        | `src/kernel/` exists.            | The client `kernel/` partly walls off `~/server/...` re-exports; the server has no equivalent need. Cross-context types on the server are predominantly gateway-output types.                                                                                                                                                                   |
| **Server contexts may not mirror client contexts 1:1** (anticipated: `code-health` is server-only). | Client contexts are UI surfaces. | Server contexts are use-case clusters; sometimes UI-surface mirrors, sometimes purely server-owned (ingestion, projection, time-series).                                                                                                                                                                                                        |

### Server-side libraries (additive)

| Concern                  | Choice                            | Rule                                                                                                                         |
| ------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Effect runtime           | `effect`                          | Single `ManagedRuntime` at process scope (`appRuntime`); handlers call `appRuntime.runPromise(toWire(...))`.                 |
| HTTP                     | `@effect/platform`'s `HttpClient` | Schema-validated bodies, retry/timeout middleware as Layers, fake via `Layer.succeed(HttpClient.HttpClient, fake)` in tests. |
| Schema (server-internal) | `effect/Schema`                   | HTTP response shapes, internal codecs, tagged-error encoders.                                                                |
| Schema (client-crossing) | `zod`                             | Any schema consumed on both sides (today: `quickCreateSchema`). One validator per side of the boundary, not per repo.        |
| Tagged errors            | `Schema.TaggedError`              | Free `Effect.catchTag` ergonomics + free wire codec via `Schema.encodeUnknownSync`.                                          |
| Tests                    | `@effect/vitest`                  | `it.effect("...", () => program)` from the start; hand-rolled fakes via `Layer.succeed`; no `vi.mock` of internal modules.   |

### Server-side policy menus (chosen point + upgrade path)

| Policy      | Phase 1                                                                                                           | Upgrade path                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Retry       | 2 attempts, exponential backoff, transient-only (network + 502/503/504) — wired as `HttpClient.layer` middleware. | Per-call `Effect.retry(customSchedule)`.                                |
| Timeout     | 10s default — wired as `HttpClient.layer` middleware.                                                             | Per-call `Effect.timeout(...)`.                                         |
| Concurrency | `Effect.all(arr, { concurrency: 5 })` at the application-service level for fan-outs.                              | Per-gateway `RateLimiter` Layer when Jira's 100 req/min limit gets hit. |
| Logger      | Adopted fully (`Logger.pretty` dev, JSON prod).                                                                   | —                                                                       |
| Tracer      | Adopted with **console-only exporter**.                                                                           | Swap exporter Layer to OTel/Honeycomb when production demands.          |
| Metrics     | **Deferred.**                                                                                                     | Adopt with appropriate exporter when first metric is worth measuring.   |

## Notes

- **Server scope.** Effect-TS server pass is merged (PRD `.agents/prds/effect-server-refactor.md`, ADR-0005). The legacy `server/jira/` and `server/gitlab/` folders were deleted at lockdown; everything lives in `server/gateways/{jira, gitlab}/` (port + adapter + types + errors) and `server/contexts/{board, detail, capture, review}/application/` (one file per use-case). The client treats the server as a single "remote application" reachable through TanStack Start server functions; the wire shape is unchanged from ADR-0004 (`{ ok: true, ... } | { ok: false, error: { _tag, ... } }`). The future `code-health` context (database-backed coverage / lint trend indicators) is **out of scope this refactor** but informs the architecture's shape.

# clashboard — clean architecture refactor (team-template reference implementation)

## Problem Statement

clashboard has grown to a real working application — Jira board, MR review queue, ticket detail, quick-create, polling, optimistic updates, e2e harness — and the existing source layout is starting to fail it. TypeScript frontend projects, unlike Java Spring or modern PHP, lack a shared idiomatic vocabulary for clean architecture, and clashboard is no exception: feature folders mix bounded-context surfaces (Board, Detail, Capture) with reusable widgets (StatusPill, TicketCard, MrSection); the word "service" is overloaded between server-side gateway-orchestrators (`JiraIssueService`) and client-side use-case layers (`DashboardService`); cross-feature dependencies form a near-mesh rather than a DAG; React, TanStack Query, sonner, and DOM access are interleaved with business logic in hooks rather than walled off behind an adapter seam.

The codebase is small enough to be approachable but complex enough to *show* an architecture, which is exactly the size at which a reference implementation can land. The team is adopting this codebase as the canonical example of how a TypeScript frontend project should be structured when a whole team is working on it. Without a deliberate refactor, every other project in the team's portfolio is a coin-flip for "where does logic go?", "how do we test screens without `renderHook`?", "can we swap React for Svelte without rewriting the application layer?", and "how do we keep cross-feature dependencies from becoming spaghetti as the codebase grows?"

The refactor is the moment to take the implicit good shape clashboard already has — pure-TS domain modules, hand-rolled discriminated-union results, factory-style services, e2e at the HTTP boundary — and turn it into an *explicit, named, enforced* architecture that other projects in the team's portfolio can copy.

## Solution

A scoped refactor of clashboard's source tree that lands a hexagonal architecture organised by bounded contexts, with a uniform layer vocabulary, a strict dependency DAG enforced by tooling, framework-free view-models, and per-layer test approaches that *demonstrate* the architecture's claims rather than just asserting them.

The destination shape:

- `src/contexts/{board, detail, review, capture}/` — one folder per bounded context, each an internal hexagon with `domain/`, `application/`, `view-model/`, `presenter/`, `view/`.
- `src/coordinator/` — cross-context workflows (apply transition, handle MR merged, create issue) that span multiple contexts.
- `src/widgets/{status-pill, ticket-card, mr-section, fixasap-ribbon}/` — reusable visual surfaces with domain meaning, peer to contexts.
- `src/kernel/` — cross-context types and domain logic (`Column`, `columnForStatus`, status-name normalisation, re-exports of server DTOs).
- `src/design-system/` — domain-agnostic primitives, populated from shadcn on second use.
- `src/{routes, lib, server}/` — unchanged in shape; server out of scope this pass.

Layers share one vocabulary across every context (domain / gateway / application service / view-model / presenter / view / coordinator); the word "service" alone is retired. `ts-pattern` is the canonical matching primitive; `neverthrow` wraps client-side results with hand-rolled tagged-error classes; the server's eventual Effect-TS pass remains decoupled because the wire format is JSON. Architectural rules are codified as `dependency-cruiser` `forbidden` rules; idiomatic React/a11y/import rules continue under an expanded oxlint; `fallow` covers drift, duplication, complexity, unused code; ts-pattern's `.exhaustive()` is the type-level gate on discriminated unions.

Migration is incremental, exemplar-first: a foundation phase ships infrastructure-only (one PR, no behaviour change); Board is migrated first end-to-end as the canonical example; remaining contexts follow; widgets and the coordinator are extracted last; rules tighten phase-by-phase until lockdown. The existing e2e harness (mocked at the HTTP boundary per ADR-0001) is the safety net throughout.

The success criterion of the React-decoupling claim is verifiable: a future Svelte port of any one screen rewrites only its presenter and view, reusing the view-model byte-for-byte.

## User Stories

### Architecture vocabulary and structure

1. As a teammate adopting this template, I want every architectural layer to have a distinct name (`domain`, `gateway`, `application service`, `view-model`, `presenter`, `view`, `coordinator`), so that I can ask "which layer is this?" and get an unambiguous answer.
2. As a teammate adopting this template, I want the word "service" alone to be retired, so that the historical overload between server-side and client-side "services" never reappears in code review.
3. As clashboard's maintainer, I want code organised by bounded contexts (`Board`, `Detail`, `Review`, `Capture`) at the top level, so that "what does this context own?" is answered by reading one folder.
4. As clashboard's maintainer, I want each bounded context to be an internal hexagon (`domain/`, `application/`, `view-model/`, `presenter/`, `view/`), so that the same vocabulary scales down to every context.
5. As clashboard's maintainer, I want cross-context workflows (apply transition, handle MR merged, create issue) to live in a coordinator above contexts, so that contexts never depend on each other.
6. As clashboard's maintainer, I want shared visual surfaces (status-pill, ticket-card, mr-section, fixasap-ribbon) organised under `widgets/` peer to contexts, so that they have a structural home distinct from contexts and design-system primitives.
7. As clashboard's maintainer, I want a `kernel/` module owning cross-context types and domain logic (`Column`, `columnForStatus`, status-name normalisation, re-exports of server DTOs), so that no single context owns types others must import.
8. As clashboard's maintainer, I want a `design-system/` module for domain-agnostic primitives populated from shadcn on second use, so that one-off primitives stay inline and shared primitives have one canonical location.

### Dependency law and enforcement

9. As clashboard's maintainer, I want the import graph to be a strict DAG enforced by `dependency-cruiser`, so that "non-hierarchical" import shapes are a CI failure rather than a code-review judgement call.
10. As a future reader, I want the dependency law expressed as one `dependency-cruiser` rule per edge, so that violations print a single sentence I can read.
11. As clashboard's maintainer, I want `contexts/A` forbidden from importing `contexts/B`, so that cross-context coupling cannot grow incrementally.
12. As clashboard's maintainer, I want `widgets/<name>` forbidden from importing any context, so that widgets stay reusable.
13. As clashboard's maintainer, I want `contexts/<name>/{domain, application, view-model}` forbidden from importing React, TanStack Query, TanStack Router, sonner, `window`, or `document`, so that the framework-free claim is enforced rather than aspirational.
14. As clashboard's maintainer, I want `@tanstack/react-query` forbidden outside presenter files (and the coordinator's cache adapter), so that query subscription has one structural home.
15. As clashboard's maintainer, I want `kernel/` forbidden from importing app code (contexts, widgets, coordinator, routes, design-system), so that the kernel cannot grow into a general utility dump.
16. As clashboard's maintainer, I want a `dependency-cruiser` SVG of the import graph in `docs/architecture.svg`, regenerated at every milestone, so that a single image conveys the whole architecture.
17. As clashboard's maintainer, I want architectural rules graduated rather than strict from day one, so that each rule lands when it can pass; the rule file becomes the record of the migration.

### Framework-free view-models, thin React presenters

18. As a teammate adopting this template, I want every non-trivial screen split into a `*-view-model.ts` (framework-free TS) and a `use-*.ts` (thin React presenter), so that the React-decoupling claim is verifiable.
19. As clashboard's maintainer, I want view-models written as ts-pattern reducers with explicit `(state, event) → state` and `(state, queryData, selection) → DisplayState` derivation, so that they are unit-testable as plain functions.
20. As clashboard's maintainer, I want trivial hooks (one piece of state, no derivation) to stay as plain hooks, so that the view-model split appears only where it pays off.
21. As clashboard's maintainer, I want presenters to be the only place TanStack Query, TanStack Router, and DOM listeners appear for a given screen, so that grep-for-`useQuery` outside `presenter/` is a CI violation.
22. As clashboard's maintainer, I want view-models to receive query data as plain values and `navigate` as an injected function, so that they have no React imports.
23. As a future maintainer porting a screen to Svelte, I want to rewrite only the presenter and view files while reusing the view-model byte-for-byte, so that the framework-decoupling claim is operationally true.

### Result types and matching

24. As clashboard's maintainer, I want client-side result types wrapped in `neverthrow`'s `ResultAsync<T, E>` / `Result<T, E>`, so that the result idiom is recognisable from Rust/ML and lighter than Effect.
25. As clashboard's maintainer, I want `E` always to be a hand-rolled tagged-error class (e.g. `class Unauthorized { readonly _tag = 'Unauthorized' }`), so that error names read as domain language.
26. As clashboard's maintainer, I want server-side result types eventually wrapped in `Effect`, so that the server gets composable async, retries, and DI.
27. As clashboard's maintainer, I want `ts-pattern.match(...).exhaustive()` as the canonical matching primitive across both sides, so that adding a new error tag is a compile error in every match site.
28. As clashboard's maintainer, I want errors to serialise on the wire as plain `{ _tag, ...payload }` JSON, so that client and server result libraries are decoupled.
29. As clashboard's maintainer, I want `if`/`else if` ladders over `result.reason === '...'` retroactively replaced with ts-pattern matches, so that the codebase has one matching style throughout.
30. As clashboard's maintainer, I want `effect` forbidden in client code and `neverthrow` forbidden in server code, so that the two libraries never meet in this codebase.

### Components and compound APIs

31. As clashboard's maintainer, I want compound APIs only where there are 2+ consumer layouts (design-system primitives via shadcn; `widgets/mr-section` for card-row vs. panel-block), so that compound is not cargo-culted into single-consumer surfaces.
32. As clashboard's maintainer, I want subcomponent extraction (named siblings under `contexts/<name>/view/`) as the default refactor for view monoliths, so that `IssueDetailPanel.tsx`, `Board.tsx`, etc. become short composition files.
33. As clashboard's maintainer, I want compound parts exposed namespace-style (`Mr.Root`, `Mr.ReviewerRow`), so that the call site reads like Radix/shadcn.
34. As clashboard's maintainer, I want sibling files placed flat in `view/` until a view's children grow past ~5 files, so that folder hierarchy does not appear prematurely.

### Coordinator

35. As clashboard's maintainer, I want `src/dashboard/` renamed to `src/coordinator/` early in the migration, so that every subsequent migrated piece imports from `~/coordinator`.
36. As clashboard's maintainer, I want the coordinator's effects (cache, toast, navigate, browser-window) declared as ports with separate adapters, so that swapping any one (e.g. cache from TanStack Query to a custom store) is a localised change.
37. As clashboard's maintainer, I want the coordinator to depend only on per-context application services and the kernel, never on context views/presenters/view-models, so that the coordinator is the *use-case orchestrator*, not the *render orchestrator*.

### Governance: four-tool kit

38. As clashboard's maintainer, I want oxlint expanded to enable `react`, `react-hooks`, `jsx-a11y`, `import`, `unicorn`, `typescript`, and `pedantic` plugins/categories, so that idiomatic-React/a11y rules run on every commit.
39. As clashboard's maintainer, I want `dependency-cruiser` codifying the dependency law in `.dependency-cruiser.cjs`, so that architectural rules are machine-checked.
40. As clashboard's maintainer, I want `npx fallow` wired into `package.json` and CI, so that drift / unused / duplication / complexity signals surface automatically.
41. As clashboard's maintainer, I want `ts-pattern.exhaustive()` as the type-level gate on discriminated unions, so that adding a new variant fails compile in every match site.
42. As clashboard's maintainer, I want pre-commit running `oxlint` on staged files plus `prettier --check` via `simple-git-hooks`, so that local feedback is sub-second.
43. As clashboard's maintainer, I want pre-push / PR CI running `tsc`, `oxlint`, `depcruise`, `fallow`, `vitest`, so that the architectural and code-quality gates run on every push.
44. As clashboard's maintainer, I want `playwright test` reserved for the heavy / nightly gate, so that fast-path feedback stays fast.
45. As clashboard's maintainer, I want ESLint *not* adopted, so that we avoid plugin-equivalence work with oxlint and keep lint sub-second; the manga calls this out as a deliberate choice.

### Test strategy per layer

46. As clashboard's maintainer, I want each architectural layer to have one named test approach, so that the test pyramid is the *evidence* of the architecture rather than a side concern.
47. As clashboard's maintainer, I want application services tested by constructing them with hand-rolled fake gateways/caches implementing the port interface, so that tests assert "given this gateway behaviour, the application service does X."
48. As clashboard's maintainer, I want view-models tested as table-driven `(state, event) → state'` reducer cases plus derivation input/output, so that screen logic is unit-testable without `renderHook`.
49. As clashboard's maintainer, I want presenters unit-tested only when they own behaviour beyond "feed view-model" (event listeners, polling, side-effect orchestration), so that view-model coverage carries the bulk of the suite.
50. As clashboard's maintainer, I want views uncovered by unit tests; e2e covers the composition layer, so that brittle render-tree assertions don't appear in the suite.
51. As clashboard's maintainer, I want coordinator tests using hand-rolled fake context-application-services and adapters, so that orchestration (optimistic patch, await, rollback / commit, toast) is asserted directly.
52. As clashboard's maintainer, I want hand-rolled fakes preferred over `vi.mock` of internal modules, so that tests depend on port contracts rather than module-graph internals.
53. As clashboard's maintainer, I want fakes lived in `__fixtures__/` folders signalled by the double-underscore prefix, so that production code is forbidden from importing them via a `dependency-cruiser` rule.
54. As clashboard's maintainer, I want most existing `use-*WithDeps` hook flavours retired, so that the React-state-injection workaround disappears once the logic moves into view-models.
55. As clashboard's maintainer, I want the e2e harness untouched (mocked at HTTP boundary per ADR-0001), so that the externally-anchored safety net survives every internal reshape.

### Migration

56. As the refactor's author, I want migration broken into named phases (Foundation → Board exemplar → other contexts → widgets → coordinator finalisation → lockdown → docs), so that progress is legible as a sequence of merged PRs.
57. As the refactor's author, I want Phase 0 (foundation) shipped as one PR with no behaviour change, so that infrastructure (libs, scaffolded folders, dep-cruise rules, oxlint expansion, fallow scripts, simple-git-hooks, coordinator rename) lands as a reviewable unit.
58. As the refactor's author, I want Board migrated first end-to-end as the exemplar, so that the canonical pattern is established before further contexts follow.
59. As the refactor's author, I want Detail, Capture, and Review contexts migrated in turn after Board, so that each follows the exemplar.
60. As the refactor's author, I want widgets extracted in Phase 5 after all contexts have moved, so that widgets crystallise from observed reuse rather than guessed reuse.
61. As the refactor's author, I want the coordinator finalised in Phase 6 (port/adapter split, port declarations), so that it ships once stable rather than being modified through every context migration.
62. As the refactor's author, I want lockdown in Phase 7 (all `dependency-cruiser` rules `error`, all graduated exceptions removed), so that the architecture is fully enforced before docs are written.
63. As the refactor's author, I want narrative documentation (tour, layers reference, README rewrite) written in Phase 8, so that the docs describe the as-merged architecture rather than the planned one.
64. As the refactor's author, I want a feature freeze for the duration of the refactor, so that cohabitation of `features/` and `contexts/` stays bounded.
65. As the refactor's author, I want each context's migration to either fully land or stay un-started — never half-merged — so that at any commit on master, `features/X` is either fully there or fully gone.
66. As the refactor's author, I want vitest tests to follow their modules to new homes via `git mv` + import-path updates, so that no semantic test changes happen during structural moves.
67. As the refactor's author, I want centralised testids in `lib/testids.ts` to absorb selector renames mechanically during widget extraction, so that the e2e harness keeps passing through structural moves.

### Documentation footprint

68. As a teammate adopting this template, I want a `CONTEXT-MAP.md` at the repo root as the architectural overview, so that the reader's first stop is one file.
69. As a future reader, I want one ADR per major architectural decision (bounded contexts + layer vocabulary; framework-free view-models; neverthrow-on-client + Effect-on-server), so that decisions surprising-without-context have a "why" page.
70. As a teammate adopting this template, I want each context to have its own `CONTEXT.md` (glossary, use-cases, view-model state-machine sketch, public surface) using a fixed template, so that context-internal documentation is found in the same place every time.
71. As a teammate adopting this template, I want a `docs/tour.md` tracing one user action ("click status pill → transition lands") through every layer with code excerpts, so that the entire architecture lands in one read.
72. As a teammate adopting this template, I want a `docs/layers.md` reference giving one annotated example per layer, so that "what does an application service look like?" is answerable by pointing at a file.
73. As a teammate adopting this template, I want the README rewritten architecture-first with PRDs linked as reference material, so that the team-template angle is the project's headline.
74. As clashboard's maintainer, I want `CLAUDE.md`'s "Simplicity First" section retired for the duration of this initiative, so that reference-implementation pedagogy can supersede minimalism where the two conflict.

### Library and tooling adoptions

75. As clashboard's maintainer, I want `ts-pattern` added as a runtime dependency, so that exhaustive matching is available everywhere.
76. As clashboard's maintainer, I want `neverthrow` added as a runtime dependency, so that client-side results have a recognisable wrapper.
77. As clashboard's maintainer, I want `dependency-cruiser` added as a dev dependency with a config codifying the dependency law, so that architectural rules run in CI.
78. As clashboard's maintainer, I want `simple-git-hooks` added with a pre-commit hook configured in `package.json`, so that pre-commit feedback runs automatically without external setup.
79. As clashboard's maintainer, I want `xstate`, `zustand`, `valtio`, `jotai`, `arktype`, `valibot`, `radash`, `remeda`, and `effect` (on the client) explicitly *not* adopted, so that the dependency surface stays small and rationale is on the record.
80. As clashboard's maintainer, I want shadcn primitives pulled in only on the second-use trigger (a primitive needed in 2+ places), so that the design system grows from observed need.

## Implementation Decisions

### Top-level folder layout

```
src/
├── kernel/                # cross-context types and domain logic; re-exports server DTOs
├── contexts/<name>/       # one bounded context per folder, internal hexagon:
│   ├── domain/            #   pure functions over kernel types
│   ├── application/       #   use-cases for one context (factory style)
│   │   ├── ports.ts       #   gateway/cache port interfaces (declared per context)
│   │   └── __fixtures__/  #   hand-rolled fake adapters used by tests
│   ├── view-model/        #   framework-free state machines + derivation (ts-pattern)
│   ├── presenter/         #   thin React adapters (TanStack Query / Router / DOM)
│   └── view/              #   React components, subcomponent-extracted siblings
├── coordinator/           # cross-context workflows
│   ├── ports.ts           #   Cache, Toast, Navigate, Browser ports
│   ├── adapters/          #   TanStack-cache, sonner-toast, router-navigate, browser-window
│   └── provider.tsx       #   composition root binding adapters into a Coordinator
├── widgets/<name>/        # reusable visual surfaces with domain meaning
├── design-system/         # domain-agnostic primitives (shadcn-on-second-use)
├── routes/                # only place where multiple contexts are wired together
├── lib/                   # framework-level utilities
└── server/                # out of scope this pass
```

### Bounded contexts

Four contexts: **Board** (column rendering, deemphasis, sort, filter, change indication), **Detail** (panel state, ADF rendering, sibling navigation, keyboard shortcuts), **Capture** (Quick Create modal, parent selection, type segmentation), **Review** (cross-cutting MR review queue projected onto the Board grid). The Review context's "fake card" projection onto columns is shared kernel terminology with Board (`Column`).

### Layer vocabulary (one set, used in every context)

- **Domain** — pure functions over kernel types; no I/O, no time, no framework.
- **Gateway** — port + adapter to an external system; the port is interface, the adapter is a factory.
- **Application service** — use-cases for one context; framework-free factory taking ports and config.
- **View-model** — state machine + derivation, both framework-free, both ts-pattern-driven.
- **Presenter** — thin React hook binding the view-model to query/router/DOM.
- **View** — React components.
- **Coordinator** — cross-context workflows (apply transition, handle MR merged, create issue, refresh-all, notify-unauthorised-once).

### Dependency law

The import graph is a strict DAG. Allowed and forbidden edges are codified in `.dependency-cruiser.cjs` as `forbidden` rules; an SVG visualisation lives at `docs/architecture.svg` and is regenerated each milestone.

Key rules:

- `contexts/A` cannot import `contexts/B` for any A ≠ B.
- `widgets/<name>` cannot import any `contexts/<name>`.
- `contexts/<name>/{domain, application, view-model}` cannot import `react`, `@tanstack/react-*`, `sonner`, `window`, `document`.
- `@tanstack/react-query` is only allowed in presenter files and the coordinator's cache adapter.
- `kernel/` cannot import any app code (contexts, widgets, coordinator, routes, design-system).
- Production code cannot import from `__fixtures__/` folders.

Rules are graduated: from-inception rules ship in Phase 0; remaining rules tighten as each phase concludes; lockdown (Phase 7) brings every rule to `error` severity.

### View-model contract

Every non-trivial screen has `*-view-model.ts` exporting:

- A `State` discriminated union (the phases).
- An `Event` discriminated union (the inputs).
- A `reduce(state, event) → state` function (ts-pattern over event tags).
- A `derive(state, queryData, selection, ...) → DisplayState` function (ts-pattern over state tags).

The presenter (`use-*.ts`) holds `state` via `useState` / `useReducer`, subscribes to TanStack Query / Router / DOM, dispatches events, and returns `derive(...)`. View-model files have **no React import**.

Trivial hooks (one `useState`, no derivation) skip the split.

### Result types

Client: `neverthrow`'s `Result<T, E>` and `ResultAsync<T, E>`. `E` is always a hand-rolled tagged-error class with a `readonly _tag` literal and an optional payload. Server: Effect (later pass). Wire format: tagged JSON. Matching: ts-pattern with `.exhaustive()` everywhere.

The retroactive ts-pattern pass replaces every `if (!result.ok) ... if (result.reason === ...) ...` ladder with a single `match(...).with(...).exhaustive()` block.

### Component patterns

- **Compound API** for `widgets/mr-section` (the only widget with two distinct consumer layouts: card row vs. panel block) and for design-system primitives pulled from shadcn. Namespace-style exports (`Mr.Root`, `Mr.ReviewerRow`).
- **Subcomponent extraction** (named siblings under `contexts/<name>/view/`) as the default refactor for view monoliths (`IssueDetailPanel`, `Board`, etc.).
- **Flat siblings** until a view's children grow past ~5 files; then a sub-folder.

### Governance kit

| Concern | Tool |
|---|---|
| Code idiom (jsx-a11y, react-hooks, exhaustive-deps, no-array-index-key, unused vars, etc.) | oxlint with expanded plugins/categories |
| Architectural rules | `dependency-cruiser` |
| Drift / unused / duplication / complexity | `npx fallow` |
| Exhaustiveness over discriminated unions | `ts-pattern.exhaustive()` |

Three CI gates: pre-commit (sub-second oxlint + prettier), PR (~30 s tsc + oxlint + depcruise + fallow + vitest), nightly (Playwright). Pre-commit via `simple-git-hooks`.

### Migration phasing

1. **Phase 0 — Foundation** (one PR): install libs; scaffold empty folders; rename `dashboard/` → `coordinator/`; configure dep-cruise (4 from-inception rules); expand oxlint; wire fallow + simple-git-hooks; set up CI gates. No behaviour change.
2. **Phase 1 — Board exemplar**: end-to-end migration of Board context; kernel domain logic extracted; per-context `CONTEXT.md` written.
3. **Phase 2 — Detail context**: follow exemplar.
4. **Phase 3 — Capture context**: follow exemplar.
5. **Phase 4 — Review context**: follow exemplar.
6. **Phase 5 — Widgets refactor**: status-pill, ticket-card, mr-section, fixasap-ribbon → `widgets/`; compound API for mr-section; shadcn primitives pulled into design-system as second-use triggers.
7. **Phase 6 — Coordinator finalisation**: adapters extracted; `Cache`, `Toast`, `Navigate`, `Browser` ports declared.
8. **Phase 7 — Lockdown**: all dep-cruise rules to `error`; graduated exceptions removed; architecture.svg regenerated.
9. **Phase 8 — Documentation**: tour, layers reference, README rewrite, ADRs polished.

Feature freeze for the duration. Each context migration either fully lands or is not started; at any master commit, `features/X` is either fully there or fully gone.

### Documentation deliverables

- `CONTEXT-MAP.md` — architectural overview (drafted during the grill).
- `docs/adr/0002-bounded-contexts-and-layer-vocabulary.md` — drafted during the grill.
- `docs/adr/0003-framework-free-view-models.md` — drafted during the grill.
- `docs/adr/0004-neverthrow-client-effect-server.md` — drafted during the grill.
- `docs/architecture.svg` — dependency-cruiser output, regenerated at every milestone.
- `contexts/<name>/CONTEXT.md` — per-context glossary + use-cases + view-model state machine + public surface; written as each context migrates.
- `docs/tour.md` — single trace through every layer for "click status pill → transition lands"; written in Phase 8.
- `docs/layers.md` — reference: each layer with one annotated example; written in Phase 8.
- `README.md` — rewritten architecture-first; written in Phase 8.

`CLAUDE.md`'s "Simplicity First" section is retired (already removed) for the duration of this initiative; reference-implementation pedagogy supersedes minimalism.

### Library additions

- `ts-pattern` (runtime).
- `neverthrow` (runtime).
- `dependency-cruiser` (dev).
- `simple-git-hooks` (dev).

Explicitly *not* adopted: `xstate`, `zustand`/`valtio`/`jotai`, `arktype`/`valibot`, `radash`/`remeda`, `effect` on the client.

shadcn is configured (`components.json`) but populated only when a primitive is needed in 2+ places.

## Testing Decisions

### What makes a good test

- Tests assert the *port contract* of a layer, not its internal structure. They survive refactors that move files around inside the same layer.
- Pure-function modules (domain, view-model, derivation) are tested with table-driven input/output.
- Application-service modules are tested by constructing the factory with **hand-rolled fakes** that implement the port interface — never `vi.mock` of internal modules. The fake's behaviour is the test's setup; the assertion is on the returned `Result` plus side-effects observable on the fake.
- View-model reducers are tested as `(state, event) → state'` tables with ts-pattern's `.exhaustive()` ensuring every branch is covered or fails compile.
- Presenters are unit-tested only when they own behaviour beyond "feed view-model" (event listeners, polling, side-effect orchestration). The bulk of screen logic is covered by view-model tests.
- Views are not unit-tested; the e2e harness covers the composition layer end-to-end against a stateful in-memory `World` via MSW Node, per ADR-0001.
- Snapshot tests are kept for the ADF renderer (existing pattern); not introduced elsewhere.

### Modules to test (Vitest)

- **Every domain module** in `kernel/` and `contexts/<name>/domain/`. Direct input/output, table-driven over edge cases.
- **Every application service** in `contexts/<name>/application/`. Constructed with hand-rolled fake gateway/cache adapters in `__fixtures__/`. Assertions: returned `Result` (Ok or Err with the right tagged error) plus fake side-effects (cache mutations, fetched URLs).
- **Every non-trivial view-model** in `contexts/<name>/view-model/`. Both reducer (`(state, event) → state'`) and derivation (`(state, queryData, ...) → DisplayState`) covered in one test file.
- **Coordinator workflows** (`applyTransition`, `handleMrMerged`, `createIssue`, `refreshAll`, `notifyUnauthorizedOnce`). Constructed with hand-rolled fake context-application-services and fake cache/toast/navigate/browser adapters. Asserts orchestration: optimistic patch, await gateway, rollback / commit, toast firing.
- **Presenters** only when there is behaviour beyond the view-model. `renderHook` with hand-rolled `WithDeps`. Most presenters skip unit tests entirely.

### What survives, what changes

- The existing **e2e harness** (Playwright + MSW Node, mocked at HTTP boundary per ADR-0001) is untouched. It is the externally-anchored safety net throughout the migration.
- Existing **pure-module tests** (`status-mapping`, `transition-resolver`, `ci-state`, etc.) move with their modules to new homes (`git mv` + import-path updates) without semantic changes.
- The existing **`use-*WithDeps` hook tests** mostly retire as their logic moves into view-models. `WithDeps` survives only on presenters with non-trivial behaviour.
- New: **view-model tests** as the dominant unit-test category.
- New: **`__fixtures__/`** convention — hand-rolled fakes signalled by the double-underscore prefix; production code is forbidden from importing from `__fixtures__/` via a `dependency-cruiser` rule.

### Prior art in this codebase

- Hand-rolled fake-pattern at the gateway level: `JiraGateway` / `GitlabGateway` ports with `createHttpJiraGateway` / `createHttpGitlabGateway` adapters; tests would inject a fake gateway implementing the same interface.
- Pure-module tests collocated as `*.test.ts` next to `*.ts`: pattern continues unchanged.
- `*WithDeps` hook flavour for testing: pattern retires as logic migrates into view-models.
- ADF renderer snapshot tests: continue as-is.

## Out of Scope

- **Server-side refactor**. `src/server/{jira, gitlab}/` is untouched this pass; an Effect-TS pass is planned separately. The client treats server functions as a "remote application" reachable through TanStack Start; results cross the boundary as plain JSON.
- **New product features**. Feature freeze for the duration of the refactor.
- **Visual / UX changes**. The refactor is invisible to the user. No new roles, labels, testids, or interactions are introduced.
- **Build-system changes**. Vite, TanStack Start, Tailwind, shadcn, Playwright, Vitest stay.
- **Effect on the client**. The JSON-boundary observation makes Effect-on-client pure cost; reserved for the server pass.
- **A switch from oxlint to ESLint**. oxlint covers the React/a11y/import idiomatic rules; dependency-cruiser covers what `eslint-plugin-boundaries` would. No plugin gap remains.
- **Tightening TypeScript strictness** beyond today's level. `exactOptionalPropertyTypes` and `noPropertyAccessFromIndexSignature` are deliberately off; they fight React prop spreading.
- **Public release of clashboard as an open template**. The team-template angle (audience b) is internal; making it public (audience c) would require additional README work and is a separate initiative.
- **Per-worker e2e parallelism**. The harness stays sequential (`workers: 1`) per the existing PRD; per-worker isolation is a future move.
- **A Svelte / Vue / Solid port**. The architecture is *designed for* a port to verify the decoupling claim; actually doing the port is out of scope.

## Further Notes

- The CONTEXT-MAP.md and three new ADRs (`docs/adr/0002`, `0003`, `0004`) were drafted during the grill that produced this PRD; they ship before Phase 0.
- The migration is sized at roughly one focused week of solo work, with each phase a self-contained PR stack. The cohabitation period (`features/` + `contexts/`) is bounded by the feature freeze.
- The strongest manga lesson is the **JSON-boundary observation** (ADR-0004): client and server result-type idioms decouple naturally at JSON serialisation, so picking the same library on both sides is style not unification. This is the kind of detail other team templates miss.
- The success criterion of the framework-decoupling claim — that a Svelte port of one screen reuses its view-model byte-for-byte — is *operationally* verifiable. A future demonstration (out of scope for this PRD) would land that proof.
- The architecture explicitly trades minimalism for legibility. Some abstractions (the view-model/presenter split on otherwise-trivial screens; tagged-error classes where a string union would do) are pedagogical, not strictly load-bearing. The retired "Simplicity First" CLAUDE.md section reflects this trade.

# clashboard

A clean-architecture reference implementation for React + TypeScript, in the form of a personal Jira / GitLab dashboard.

## What this codebase shows

clashboard is a small but complete demonstration of four architectural claims, each verifiable by reading a named layer or rule:

- **Bounded contexts as the organising axis.** The codebase is split into `contexts/{board, detail, capture, review}/`, each an internal hexagon (domain → application → view-model → presenter → view); cross-context workflows live in a single `coordinator/`. See [ADR 0002 — Bounded contexts and layer vocabulary](docs/adr/0002-bounded-contexts-and-layer-vocabulary.md).
- **Framework-free view-models with thin React presenters.** Every non-trivial screen splits into `view-model.ts` (plain TS, no React import) plus `use-*.ts` (the only React-bound shell), so the logic is portable and unit-testable as ordinary functions. See [ADR 0003 — Framework-free view-models](docs/adr/0003-framework-free-view-models.md).
- **Tagged-error result types, matched exhaustively.** `neverthrow` on the client and `Effect` on the server share a JSON-shaped tagged-union wire format; `ts-pattern.exhaustive()` makes "errors as values" a compile-time invariant. See [ADR 0004 — neverthrow on the client, Effect on the server](docs/adr/0004-neverthrow-client-effect-server.md) and [ADR 0005 — Effect-TS server architecture](docs/adr/0005-effect-server-architecture.md).
- **Architectural rules enforced as CI gates.** The dependency law is codified one rule per edge in `.dependency-cruiser.cjs`; `oxlint`, `dependency-cruiser`, `fallow`, and `ts-pattern.exhaustive` make drift a CI failure with a named rule attached. See [CONTEXT-MAP — Governance: one tool per concern](CONTEXT-MAP.md#governance-one-tool-per-concern).

## What this app is

clashboard is a personal Jira / GitLab dashboard: a Kanban board of my tickets with the four columns I think in (TO DO · In Implementation · In Code Review · Done), a side-panel detail view with native ADF rendering, optimistic status transitions, GitLab MR review cards, and a quick-create modal. It is read-mostly; the only mutations are status changes and ticket creation. The product surface is documented in [`.agents/prds/clashboard.md`](.agents/prds/clashboard.md); supplementary PRDs cover [GitLab MR review cards](.agents/prds/gitlab-mr-review-cards.md), [GitLab MR status on Code Review cards](.agents/prds/gitlab-mr-status.md), [Quick Create](.agents/prds/quick-create.md), [e2e harness](.agents/prds/e2e-harness.md), [misc improvements](.agents/prds/misc-improvements.md), and the [clean-architecture refactor](.agents/prds/clean-architecture-refactor.md) this README is part of.

## How to read this codebase

In order:

1. **[`CONTEXT-MAP.md`](CONTEXT-MAP.md)** — the architectural overview. Contexts, the layer vocabulary, the dependency law, governance, library choices.
2. **[`docs/tour.md`](docs/tour.md)** — one user action (clicking a status pill, picking a transition) traced through every layer end to end. The manga's first chapter.
3. **[`docs/layers.md`](docs/layers.md)** — reference: each of the seven layers with one annotated example drawn from the migrated codebase.
4. **`contexts/<name>/CONTEXT.md`** — per-context glossary, use-cases, and view-model state machine: [Board](src/contexts/board/CONTEXT.md), [Detail](src/contexts/detail/CONTEXT.md), [Capture](src/contexts/capture/CONTEXT.md), [Review](src/contexts/review/CONTEXT.md).
5. **[`docs/adr/`](docs/adr/)** — the five decisions that shape the architecture: [0001 mock at the network boundary](docs/adr/0001-mock-at-network-boundary-for-e2e.md), [0002 bounded contexts](docs/adr/0002-bounded-contexts-and-layer-vocabulary.md), [0003 framework-free view-models](docs/adr/0003-framework-free-view-models.md), [0004 neverthrow / Effect](docs/adr/0004-neverthrow-client-effect-server.md), [0005 Effect-TS server architecture](docs/adr/0005-effect-server-architecture.md).

## Folder layout

```
src/
├── kernel/         # cross-context types and pure domain helpers (Column, status mapping)
├── contexts/       # one bounded context per folder, each an internal hexagon
│   ├── board/      # the four-column Kanban
│   ├── detail/     # side-panel ticket view
│   ├── capture/    # quick-create modal
│   └── review/     # GitLab MR review cards
├── widgets/        # reusable visual surfaces (status-pill, ticket-card, mr-section, fixasap-ribbon)
├── coordinator/    # cross-context workflows + ports (cache, toast, navigate, browser, jira)
├── design-system/  # domain-agnostic primitives (skeletons, shadcn pieces)
├── routes/         # the only place multiple contexts are wired together
├── lib/            # framework-level utilities (cn, testids, polling)
└── server/         # Effect-TS server (gateways, use-case contexts, runtime, wire, server-functions)
    ├── gateways/    # one folder per external system: port + http-adapter + types + errors (Jira, GitLab)
    ├── contexts/    # one folder per use-case cluster: application/, domain/, errors, config (Board, Detail, Capture, Review)
    ├── runtime/     # ServerEnv Tag + Layer, appLayer, appRuntime (process-scoped ManagedRuntime)
    ├── wire/        # toWire(program, errorSchema) — the only Effect→JSON boundary
    └── server-functions/  # createServerFn handlers — appRuntime.runPromise(toWire(...))
```

`features/` no longer exists; its contents moved into `kernel/`, `contexts/`, and `widgets/` during the refactor and the folder is forbidden by a dependency-cruiser rule.

## Architecture diagram

![clashboard dependency graph as enforced by dependency-cruiser, regenerated each milestone](docs/architecture.svg)

This SVG is regenerated by `pnpm docs:arch` (depcruise → DOT → SVG) and is the source of truth for which import edges are allowed.

## Quick start

Prerequisites: Node 20+, [pnpm](https://pnpm.io/) 10.

```sh
pnpm install
cp .env.example .env  # fill in JIRA_*, GITLAB_* (see .env.example for documentation)
pnpm dev              # http://localhost:3000
```

Other useful scripts:

| Command                             | Purpose                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                          | Vite dev server with TanStack Start.                                                                         |
| `pnpm build`                        | Production build.                                                                                            |
| `pnpm typecheck`                    | `tsc --noEmit` for both source and the e2e tsconfig.                                                         |
| `pnpm test`                         | Vitest unit tests.                                                                                           |
| `pnpm test:e2e`                     | Playwright end-to-end suite (MSW-mocked, see [ADR 0001](docs/adr/0001-mock-at-network-boundary-for-e2e.md)). |
| `pnpm lint`                         | `oxlint` over `src/`.                                                                                        |
| `pnpm depcruise`                    | Verify the dependency law.                                                                                   |
| `pnpm check:arch`                   | `npx fallow` — drift, dead code, duplication, complexity.                                                    |
| `pnpm docs:arch`                    | Regenerate `docs/architecture.svg`.                                                                          |
| `pnpm format` / `pnpm format:check` | Prettier.                                                                                                    |

## Governance

Four tools, each owning exactly one concern; ESLint is deliberately not in the kit:

| Concern                                                             | Tool                                                |
| ------------------------------------------------------------------- | --------------------------------------------------- |
| Code idiom (jsx-a11y, react-hooks, exhaustive deps, unused vars, …) | `oxlint`                                            |
| Architecture rules (the dependency law, one rule per edge)          | `dependency-cruiser`                                |
| Drift, unused code, duplication, complexity                         | `fallow` (`npx fallow`)                             |
| Exhaustiveness over discriminated unions                            | `ts-pattern.exhaustive()` (compile-time, no plugin) |

Three CI gates, ordered by speed:

| Gate             | When                  | What                                                                                    | Local command           |
| ---------------- | --------------------- | --------------------------------------------------------------------------------------- | ----------------------- |
| Pre-commit       | every commit (staged) | `oxlint --staged`, `prettier --check`. Sub-second.                                      | `pnpm exec lint-staged` |
| Pre-push / PR CI | every push            | `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test`. ~30 s. | (above, in order)       |
| Heavy            | nightly / pre-release | `pnpm test:e2e`. Multiple minutes.                                                      | `pnpm test:e2e`         |

Pre-commit hooks are wired via `simple-git-hooks` (configured in `package.json`, no extra dependency). The full set of dependency-cruiser rules lives in [`.dependency-cruiser.cjs`](.dependency-cruiser.cjs); each rule's `comment:` field carries its one-sentence rationale. See [CONTEXT-MAP § Governance](CONTEXT-MAP.md#governance-one-tool-per-concern) for details.

## The team-template angle

We use this codebase as **the canonical example of clean architecture for our team's TypeScript frontend projects**. New projects in the team should mirror three things from clashboard:

1. **The layer vocabulary.** Domain · Gateway · Application service · View-model · Presenter · View · Coordinator. The word "service" alone is never used; each layer has a distinct name. See [`CONTEXT-MAP.md`](CONTEXT-MAP.md#layer-vocabulary-shared-by-every-context).
2. **The dependency law.** A strict DAG with sideways edges between bounded contexts forbidden, React / TanStack Query / sonner kept out of domain / application / view-model layers, and a coordinator that depends on application services but never on views.
3. **The test approach per layer.** Domain & view-model: pure call/assert. Application service & coordinator: hand-rolled fakes for ports, no `vi.mock` of internal modules. Presenter: only when there's behaviour beyond feeding the view-model. View: e2e only.

If you are starting a new team project and reach for clashboard's structure, the test you should be able to pass is: open a context cold and answer "where would I add a new use-case?" within thirty seconds, by name.

## Status

This is a **reference implementation**, not a product. The architecture is enforced by the three CI gates above; any drift fails CI with a named rule attached. Changes that alter the architecture — new layer, new dependency edge, new tool — require a new ADR in [`docs/adr/`](docs/adr/) before the rule is relaxed. The migration that produced today's structure is recorded in [`.agents/prds/clean-architecture-refactor.md`](.agents/prds/clean-architecture-refactor.md) and its associated slices.

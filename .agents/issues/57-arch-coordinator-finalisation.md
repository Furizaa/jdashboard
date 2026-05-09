# 57 — Architecture: coordinator finalisation (port/adapter split, naming)

**Type:** AFK

## Parent

[Clean architecture refactor PRD](../prds/clean-architecture-refactor.md)

## What to build

Finalise the `src/coordinator/` module that was renamed in slice 51 by splitting effects into named ports + adapters, declaring the coordinator's public surface explicitly, and renaming the symbol `DashboardService` → `Coordinator` (and `useDashboardService` → `useCoordinator`).

After this slice merges, the coordinator is a small framework-free factory `createCoordinator(deps: CoordinatorDeps)` whose only React-bound code lives in `coordinator/provider.tsx`. The four side-effect concerns (cache, toast, navigate, browser-window) are each declared as a port, with a default React-bound adapter that wires it from the runtime (TanStack Query, sonner, TanStack Router, `window`). Every effect is testable in isolation by passing a fake adapter.

Concretely:

- **Ports** (`src/coordinator/ports.ts`) — explicit interfaces:
  - `Cache` — the existing `DashboardCache` interface, renamed to `Cache` (it's the only cache abstraction now)
  - `Toast` — minimal interface: `success(message, opts?)`, `error(message, opts?)`. Replaces direct `sonner` imports inside the coordinator.
  - `Navigate` — `toIssue(key)`, `clearIssue()`. Replaces direct `useNavigate` imports.
  - `Browser` — `openInNewTab(url)`, `copyToClipboard(text): Promise<void>`. Replaces direct `window.open` / `navigator.clipboard` calls.
- **Adapters** (`src/coordinator/adapters/`):
  - `tanstack-cache.ts` — `createTanstackCacheAdapter(queryClient): Cache`. The existing `tanstack-cache.ts` is moved here.
  - `sonner-toast.ts` — `createSonnerToastAdapter(): Toast`.
  - `router-navigate.ts` — `createRouterNavigateAdapter(navigate): Navigate`.
  - `browser-window.ts` — `createBrowserWindowAdapter(): Browser`.
- **Coordinator factory** (`src/coordinator/coordinator.ts`) — `createCoordinator(deps: { cache, toast, navigate, browser, jira, clock, setTimeout, clearTimeout, createIssueTimeoutMs })` returns the orchestration surface (`applyTransition`, `handleMrMerged`, `createIssue`, `refreshAll`, `notifyUnauthorizedOnce`). Symbol rename: `DashboardService` → `Coordinator`. The `jira` dep splits into per-context application services where each cross-context workflow needs them — e.g., `applyTransition` depends on the Jira gateway port for the transition call, and on the Board / Detail application services for cache patches.
- **Provider** (`src/coordinator/provider.tsx`) — composition root: instantiates each adapter, builds the coordinator, exposes it via `CoordinatorCtx`. `useCoordinator()` hook replaces `useDashboardService()`.
- **Coordinator tests** (`src/coordinator/coordinator.test.ts`) — constructed with hand-rolled fakes for every port + every context application service. Asserts orchestration: optimistic patch, await gateway, rollback / commit, toast firing, with explicit timing via injected `clock` / `setTimeout` / `clearTimeout`. Replaces the existing `service.test.ts`.
- **Symbol rename** propagates: every consumer of `useDashboardService` updates to `useCoordinator`. `DashboardCtx` → `CoordinatorCtx`. `DashboardProvider` → `CoordinatorProvider`.
- **Hooks-as-presenter-helpers** (`src/coordinator/hooks.ts`) — the existing `useBoardData`, `useTicket`, `useTransitions`, `useMrStatuses`, `useReviewCards`, `useMrFor`, `useTransitionAction`, `useCreateAction`, `useMrMergedAction`, `useRefreshAll` continue to live here as *coordinator-level data hooks*. They're imported by context presenters. They are *thin* — wrapping the coordinator's actions and TanStack Query subscriptions.
- **Dependency-cruiser tightening:**
  - `coordinator → contexts/<name>/{view, presenter, view-model}` becomes `error` (was already in the from-inception set; verified now)
  - `coordinator → react / @tanstack/react-* / sonner / window / document` is forbidden *outside the adapters/ subfolder and provider.tsx*
  - `contexts/<name>/{domain, application, view-model}` cannot import from `~/coordinator/adapters/` or `~/coordinator/provider.tsx`
- **Retroactive ts-pattern pass** within the coordinator code.
- **neverthrow** — coordinator's actions return `ResultAsync<T, E>` consistent with context application services.

## Acceptance criteria

- [ ] `src/coordinator/ports.ts` declares `Cache`, `Toast`, `Navigate`, `Browser` interfaces.
- [ ] `src/coordinator/adapters/{tanstack-cache, sonner-toast, router-navigate, browser-window}.ts` exist and each provides a `create*Adapter` factory.
- [ ] `src/coordinator/coordinator.ts` exports `createCoordinator` and `Coordinator` (the type).
- [ ] `src/coordinator/provider.tsx` exposes `CoordinatorProvider` and `useCoordinator`. `DashboardCtx`, `useDashboardService`, `DashboardProvider`, `DashboardService` are gone; consumers updated.
- [ ] `src/coordinator/coordinator.test.ts` exists; tests are written against hand-rolled fakes for every port and every context application service.
- [ ] No file under `src/coordinator/` outside `adapters/` and `provider.tsx` imports `react`, `@tanstack/react-*`, `sonner`, `window`, or `document`.
- [ ] No file under `contexts/<name>/{domain, application, view-model}/` imports from `~/coordinator/adapters/` or `~/coordinator/provider.tsx` (only ports and the `useCoordinator` hook are visible to presenters).
- [ ] All `if`/`else if` ladders over result-tag fields in the coordinator are replaced with `ts-pattern.match(...).exhaustive()`.
- [ ] Coordinator workflow methods return `neverthrow` `ResultAsync<T, E>` where applicable.
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test && pnpm test:e2e` all green.
- [ ] User-visible behaviour is identical.
- [ ] `docs/architecture.svg` regenerated; the coordinator's adapters layer is visible.

## Blocked by

- 56 — Architecture: widgets refactor

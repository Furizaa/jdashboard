# 58 — Architecture: lockdown (all rules to error, graduated exceptions removed)

**Type:** AFK

## Parent

[Clean architecture refactor PRD](../prds/clean-architecture-refactor.md)

## What to build

The architecture is fully migrated. This slice tightens all `dependency-cruiser` rules to `error` severity, removes every graduated exception that was added during the migration, audits the remaining `src/features/` content (which should now be empty or near-empty), and regenerates the architecture diagram from the locked-down state.

After this slice merges, the dependency law is fully enforced. No graduated rules. No migration exceptions. Adding a new context, widget, or coordinator method requires placing it correctly per the law. `npx fallow` shows zero unexpected drift signals.

Concretely:

- **Audit `src/features/`.** Whatever remains is either:
  - **Auth-status** (`AuthGate`) — likely lives most naturally as a small surface in the route shell or as a tiny `contexts/auth/` (a session context). Decide the placement during this slice; either way, `features/auth-status/` is removed.
  - **Header** (`Header`, `Logo`, `SearchInput`, `GitlabIndicator`) — the route shell. Lives under `src/routes/` (since it's only used by routes) or as a route-level component co-located with the index route. `features/header/` is removed.
  - **Anything else** — by this point this should be nothing.
  
  If an item legitimately doesn't fit a context or a widget, it goes into `src/lib/` or `src/routes/`; never back into `src/features/`. The folder is deleted at the end of this slice.

- **Remove graduated exceptions in `.dependency-cruiser.cjs`.** Specifically:
  - The `contexts/board → contexts/review` exception from slice 55: revisit. The Review projection function moves to `kernel/` (so Board imports it from `~/kernel/review` instead of `~/contexts/review`), eliminating the cross-context edge. Or the rule is permanently allowed via a single sanctioned exception with an inline rationale comment. Decide here.
  - Any other "for now" exceptions written during slices 52–57.

- **All rules to `error`.** Every rule in `.dependency-cruiser.cjs` reads `severity: "error"`. No `warn`. No commented-out rules. No migration-period exceptions.

- **The full rule set in place** (final list, not exhaustive):
  - `no-cross-context`
  - `no-react-in-domain-application-view-model`
  - `no-tanstack-query-outside-presenter`
  - `kernel-cant-import-app-code`
  - `widgets-stay-out-of-contexts`
  - `coordinator-cant-see-context-views`
  - `coordinator-effects-only-in-adapters` (no `react` / `sonner` / `window` outside `coordinator/adapters/` and `coordinator/provider.tsx`)
  - `production-cant-import-fixtures` (no production code reaches into `__fixtures__/`)
  - `no-features-folder` — `src/features/` is forbidden as a path; existence is a CI failure
  - Any context-specific or widget-specific rule that emerged during migration

- **Architecture diagram regenerated.** Run `pnpm docs:arch` and commit. The diagram now shows the final shape: `routes → contexts → widgets → coordinator → contexts/<name>/application → kernel`, with the kernel at the foundation and `server` re-exported into `kernel`.

- **Fallow audit.** Run `npx fallow` and address any unexpected unused / duplicated / drifted signals. Acceptable signals: anything in `__fixtures__/` (test-only, not production-imported); anything in `kernel/` re-exported from `server/` and consumed elsewhere. Unacceptable signals: dead code in `contexts/`, `widgets/`, `coordinator/`.

- **Type-import discipline.** A pass to ensure `import type { ... }` is used everywhere `verbatimModuleSyntax` requires it. oxlint's `import/consistent-type-specifier-style` enforces this from inception, but the migration may have left inconsistencies.

- **Smoke test the manga claim.** Open the architecture.svg, walk one user action visually through the layers, confirm every edge in the trace appears in the SVG. This is a manual sanity check; the assertion is "the diagram tells the same story as the code."

## Acceptance criteria

- [ ] `src/features/` does not exist after this PR.
- [ ] `.dependency-cruiser.cjs` has zero `severity: "warn"` rules; every rule is `error`. No commented-out rules. No "graduated" or "migration" exception comments remain.
- [ ] The Review projection's placement is settled: either it lives in `~/kernel/` (eliminating the `contexts/board → contexts/review` edge) or the cross-context edge is permanently allowed via a single sanctioned exception with an inline rationale.
- [ ] `pnpm depcruise` exits 0 against the full ruleset.
- [ ] `pnpm check:arch` (fallow) exits 0 with no unexpected signals.
- [ ] `docs/architecture.svg` is regenerated and committed; the diagram visually matches the dependency law.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` all green.
- [ ] `pnpm format:check` exits 0.
- [ ] User-visible behaviour is identical.
- [ ] A manual walk of "click status pill → transition" through the SVG reaches the user-action endpoint via the documented path.

## Blocked by

- 57 — Architecture: coordinator finalisation

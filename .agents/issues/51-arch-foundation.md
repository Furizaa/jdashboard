# 51 — Architecture: foundation (scaffolding, libs, governance, coordinator rename)

**Type:** AFK

## Parent

[Clean architecture refactor PRD](../prds/clean-architecture-refactor.md)

## What to build

A single PR that lands the architectural foundation with **no behaviour change**. After this PR merges, master compiles, e2e passes, the user-visible app is identical, and every subsequent context-migration slice can land against an already-prepared scaffold.

This is the only slice in the refactor that is intentionally horizontal — it ships infrastructure rather than a vertical user-visible flow. It is sized so that the entire diff is reviewable as one unit; splitting it across multiple PRs would create intermediate states that don't compile or can't pass e2e.

Concretely:

- **Library installs.** Add `ts-pattern`, `neverthrow` (runtime); `dependency-cruiser`, `simple-git-hooks` (dev). Pin to current stable.
- **Folder scaffolding.** Create empty `src/kernel/`, `src/contexts/`, `src/widgets/`, `src/coordinator/`, `src/design-system/` with `.gitkeep` files. No source files moved yet.
- **Coordinator rename.** Rename `src/dashboard/` → `src/coordinator/`. Update all imports across the codebase (`~/dashboard` → `~/coordinator`). Internal file names stay the same; the folder rename + import path update is mechanical. The exported symbol `DashboardService` / `DashboardProvider` / `useDashboardService` keeps its name in this slice — promoting to `Coordinator` / `useCoordinator` is part of slice 57 (coordinator finalisation).
- **Dependency-cruiser config.** `.dependency-cruiser.cjs` with the four from-inception `forbidden` rules: `no-cross-context`, `no-react-in-domain-application-view-model`, `no-tanstack-query-outside-presenter`, `kernel-cant-import-app-code`. Each rule reads as one sentence. Severity `error`; the rules pass against the current codebase because the targeted folders are empty.
- **oxlint expansion.** `.oxlintrc.json` adds `pedantic` category; enables `react`, `react-hooks`, `jsx-a11y`, `import`, `unicorn`, `typescript` plugins. Address any newly-failing rules in the existing codebase (suppressions only where genuinely intractable, with a comment explaining why; otherwise fix).
- **Fallow integration.** Add `package.json` script `"check:arch": "npx fallow"`. Confirm `.fallow/` cache files are gitignored (`.fallow/*.bin`).
- **simple-git-hooks pre-commit.** `simple-git-hooks` config in `package.json` running `oxlint` on staged files + `prettier --check` on staged files. `pnpm install` triggers `simple-git-hooks` setup automatically (postinstall script).
- **CI gates restructured into three.** Existing CI structure (whatever shape it has) is reorganised into three named jobs:
  - **pre-commit** (local; via simple-git-hooks): oxlint --staged, prettier --check
  - **PR** (CI): `tsc --noEmit` (both configs), `oxlint`, `depcruise`, `npx fallow`, `vitest run`
  - **nightly / heavy** (CI): `playwright test`
- **Architecture diagram seed.** Add a placeholder `docs/architecture.svg` and a `package.json` script `"docs:arch": "depcruise --output-type dot src | dot -Tsvg -o docs/architecture.svg"`. Run once and commit.

## Acceptance criteria

- [ ] `pnpm install` succeeds; `ts-pattern`, `neverthrow`, `dependency-cruiser`, `simple-git-hooks` are installed at pinned stable versions.
- [ ] `src/{kernel, contexts, widgets, coordinator, design-system}` exist with `.gitkeep`s; the existing `src/features/`, `src/server/`, `src/routes/`, `src/lib/` are untouched in shape.
- [ ] `src/dashboard/` is gone; `src/coordinator/` contains the same files. All imports of `~/dashboard` are replaced with `~/coordinator` across the codebase. The exported symbol names (`DashboardService`, `DashboardProvider`, `useDashboardService`) are unchanged in this slice.
- [ ] `.dependency-cruiser.cjs` exists with the four from-inception rules at `error` severity. `pnpm depcruise` exits 0.
- [ ] `.oxlintrc.json` includes the expanded plugin set + `pedantic`. `pnpm lint` exits 0.
- [ ] `pnpm check:arch` runs `npx fallow` and exits 0. `.fallow/*.bin` is gitignored.
- [ ] A staged commit with a deliberate prettier or oxlint error is rejected by the pre-commit hook.
- [ ] CI is reorganised into three named jobs (pre-commit semantics, PR, nightly) and all gates green on this PR.
- [ ] `docs/architecture.svg` is committed; `pnpm docs:arch` regenerates it.
- [ ] `pnpm typecheck && pnpm test && pnpm test:e2e` all green.
- [ ] No file inside `src/features/`, `src/routes/`, `src/server/`, or `src/lib/` is functionally modified — only the `~/dashboard` → `~/coordinator` import path update.
- [ ] User-visible behaviour is identical (e2e is the gate).

## Blocked by

None — can start immediately.

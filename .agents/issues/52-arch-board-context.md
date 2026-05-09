# 52 — Architecture: Board context migration (exemplar)

**Type:** HITL

## Parent

[Clean architecture refactor PRD](../prds/clean-architecture-refactor.md)

## What to build

End-to-end migration of the Board feature into the new architecture. This is the **exemplar** — the canonical example that subsequent context migrations (Detail, Capture, Review) follow. All decisions made here cascade across slices 53–55, so this slice is HITL: review-time discussions are expected to surface unforeseen issues; once the pattern lands, the others follow mechanically.

After this slice merges, `src/features/board/` is gone; `src/contexts/board/{domain,application,view-model,presenter,view}` exists; cross-context domain logic that previously sat in `features/board/` lives in `kernel/`; the Board route renders unchanged from the user's perspective; e2e passes; `dependency-cruiser` rules pass against the new layout.

Concretely:

- **Kernel extraction.** Cross-context domain logic moves out of Board into `kernel/`:
  - `Column` type and `COLUMNS` constant → `kernel/columns.ts`
  - `columnForStatus`, `statusesForColumn` → `kernel/columns.ts`
  - status-name normalisation (case-insensitive equality) → `kernel/status.ts`
  - `deemphasize` → `kernel/columns.ts` (it's column-aware domain logic, not Board-specific)
  - re-exports of server DTO types used cross-context → `kernel/jira.ts` and `kernel/gitlab.ts`
- **Board domain layer** (`contexts/board/domain/`): pure modules that *are* Board-specific — `sort-column`, `filter-issues`, `assemble-columns`, `use-change-indication` (the pure derivation parts; the React-bound state goes to the presenter). Each module's existing tests come along via `git mv` + import-path update.
- **Board application layer** (`contexts/board/application/`):
  - `ports.ts` — declares the gateway port and cache port the application service consumes
  - `board-application.ts` — factory `createBoardApplicationService(deps)` exposing the small surface Board needs (`refresh()`, `loadBoard()` if not already covered by the cache port)
  - `__fixtures__/fake-gateway.ts` — hand-rolled fake implementing the gateway port
  - `__fixtures__/fake-cache.ts` — hand-rolled fake implementing the cache port
  - `board-application.test.ts` — application service tested with the fakes
- **Board view-model layer** (`contexts/board/view-model/`):
  - `board-view-model.ts` — framework-free state machine + derivation. Existing `BoardViewState` discriminated union becomes the `State`; events are explicit (`refetched`, `searchChanged`, `auxiliarySubscribed`, …); `reduce(state, event)` and `derive(state, queryData, ...)` separated; ts-pattern `.exhaustive()` everywhere.
  - `board-view-model.test.ts` — table-driven `(state, event) → state'` plus derivation input/output tests. **No `renderHook`.**
- **Board presenter layer** (`contexts/board/presenter/`):
  - `use-board-view.ts` — thin React hook holding `state` via `useReducer(reduce, initial)`, subscribing TanStack Query, dispatching events on query changes, returning `derive(state, queryData)`. The current `useBoardView` / `useBoardViewWithDeps` collapse into this single thin presenter; the existing `WithDeps` flavour retires.
- **Board view layer** (`contexts/board/view/`):
  - `Board.tsx` — short composition of subcomponents
  - `BoardColumn.tsx`, `BoardSkeleton.tsx`, `EmptyBoard.tsx`, `ErrorBanner.tsx`, `BoardMessage.tsx` — extracted siblings; each was a private inner component in the old monolith
- **Per-context CONTEXT.md** (`contexts/board/CONTEXT.md`) using the fixed template: what this context owns; glossary; use-cases (application service surface); view-model state machine sketch; cross-context dependencies; public surface (barrel exports).
- **Barrel** (`contexts/board/index.ts`): exports `Board` (the view) and the route-needed types only. No internal types leak.
- **Old code removed.** `src/features/board/` is deleted. Routes import `~/contexts/board`.
- **Retroactive ts-pattern pass** within the migrated Board code — every `if`/`else if` ladder over result-tag fields becomes `match(...).with(...).exhaustive()`.
- **neverthrow adoption** within Board's application service — the `BoardApplicationService` returns `ResultAsync<T, E>` with hand-rolled tagged-error classes; the presenter unwraps via `result.match` or via ts-pattern over the underlying tagged union.
- **Dependency-cruiser rules tightened** — the from-inception rules now have a real folder to evaluate against; an additional graduated rule for Board specifically becomes enforceable.
- **Existing `useBoardData` / `useBoardView` callers** (Header, IssueDetailPanel, etc.) continue to work via re-exports from the coordinator's data hooks. Their migration to context-aware imports happens in their own slices.

## Acceptance criteria

- [ ] `src/features/board/` does not exist after this PR.
- [ ] `src/kernel/columns.ts`, `src/kernel/status.ts` exist and are imported by Board's domain and view-model modules.
- [ ] `src/contexts/board/{domain,application,view-model,presenter,view}` exist and are populated.
- [ ] `contexts/board/application/__fixtures__/` contains hand-rolled fake gateway and fake cache modules.
- [ ] `contexts/board/CONTEXT.md` exists, follows the fixed template, and documents the Board view-model's state machine.
- [ ] `board-view-model.test.ts` exists; tests are table-driven and do not use `renderHook`.
- [ ] `board-application.test.ts` exists; application service is tested via hand-rolled fakes (no `vi.mock` of internal modules).
- [ ] All `if`/`else if` ladders over result-tag fields in the migrated Board code are replaced with `ts-pattern.match(...).exhaustive()`.
- [ ] `BoardApplicationService` returns `neverthrow` `ResultAsync<T, E>` with tagged-error classes for `E`.
- [ ] No file under `contexts/board/{domain, application, view-model}/` imports `react`, `@tanstack/react-*`, `sonner`, `window`, or `document` (verified by `dependency-cruiser`).
- [ ] No file under `contexts/board/` imports from `~/contexts/<other>` (verified by `dependency-cruiser`).
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test && pnpm test:e2e` all green.
- [ ] User-visible behaviour is identical (e2e is the gate).
- [ ] `docs/architecture.svg` regenerated and committed; the new edges (routes → contexts/board, contexts/board → kernel, contexts/board → coordinator) are visible.

## Blocked by

- 51 — Architecture: foundation

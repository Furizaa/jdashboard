# 54 — Architecture: Capture context migration

**Type:** AFK

## Parent

[Clean architecture refactor PRD](../prds/clean-architecture-refactor.md)

## What to build

End-to-end migration of the quick-create feature into the new architecture, following the Board exemplar from slice 52. The Capture context is clashboard's smallest surface — a modal with four fields — which makes it the cleanest demonstration of "view-model + presenter + view" on a forms-driven flow.

After this slice merges, `src/features/quick-create/` is gone; `src/contexts/capture/{domain,application,view-model,presenter,view}` exists; the Quick Create modal opens, validates, submits, and toasts unchanged from the user's perspective; e2e passes.

Capture owns: modal open/close state machine, type segmentation, parent selection (pinned + dynamic in-progress epics), summary input with `[FE]:` prefix, description textarea, submit/timeout/error flow, the `c` keyboard shortcut.

Capture does **not** own: the Quick Create button placement (that's the Header / route shell). The button moves with Capture's barrel — `QuickCreateButton` is part of Capture's public surface.

Concretely:

- **Capture domain layer** (`contexts/capture/domain/`): `hardcoded-parents`. Move existing.
- **Capture application layer** (`contexts/capture/application/`):
  - `ports.ts` — gateway port for `createIssue` and `loadMyEpics`
  - `capture-application.ts` — factory; exposes `submit(input)` and `loadEpics()`. The submit flow's optimistic-invalidation + toast actions stay in the coordinator (cross-context: Board needs to invalidate; toast lives in coordinator); Capture's application service handles validation + the gateway call.
  - `__fixtures__/fake-gateway.ts`
- **Capture view-model layer** (`contexts/capture/view-model/`):
  - `quick-create-view-model.ts` — state machine over `closed | open-idle | open-pending | open-error`; events are `opened`, `closed`, `formSubmitted`, `submitResolved`, `submitRejected`, `timedOut`. Table-driven tests.
- **Capture presenter layer** (`contexts/capture/presenter/`):
  - `use-quick-create.ts` — thin React shell. The current `useQuickCreate` / `useQuickCreateWithDeps` collapse here.
  - `use-my-epics.ts` continues as a presenter-level helper if needed; or its derivation moves into the view-model.
- **Capture view layer** (`contexts/capture/view/`):
  - `QuickCreateButton.tsx`, `QuickCreateModal.tsx`, `QuickCreateForm.tsx`, `ParentSelect.tsx`, `SummaryInput.tsx`, `TypeSegmented.tsx`. Existing files move wholesale; subcomponent extraction is minimal because the feature is already well-decomposed.
- **Per-context CONTEXT.md** (`contexts/capture/CONTEXT.md`) using the fixed template.
- **Barrel** exports `QuickCreateButton` (the trigger) — that's all the route needs.
- **Header import update** — `~/features/header` (or its eventual home) imports `QuickCreateButton` from `~/contexts/capture` instead of `~/features/quick-create`.
- **Old code removed.** `src/features/quick-create/` is deleted.
- **Retroactive ts-pattern pass.**
- **neverthrow** for `submit` and `loadEpics`.
- **Quick Create schema** (`quick-create-schema.ts`) stays in `server/jira/` (it's the server function's input validator); `kernel/` re-exports the inferred type if needed by the view-model.

## Acceptance criteria

- [ ] `src/features/quick-create/` does not exist after this PR.
- [ ] `src/contexts/capture/{domain,application,view-model,presenter,view}` exist and are populated.
- [ ] `contexts/capture/CONTEXT.md` exists, follows the fixed template.
- [ ] `quick-create-view-model.test.ts` exists; tests are table-driven.
- [ ] All `if`/`else if` ladders over result-tag fields in the migrated Capture code are replaced with `ts-pattern.match(...).exhaustive()`.
- [ ] `CaptureApplicationService.submit` returns `ResultAsync<T, E>` with tagged-error classes for `E`.
- [ ] No file under `contexts/capture/{domain, application, view-model}/` imports `react`, `@tanstack/react-*`, `sonner`, `window`, or `document`.
- [ ] No file under `contexts/capture/` imports from `~/contexts/<other>`.
- [ ] The Header (or route shell) imports `QuickCreateButton` from `~/contexts/capture`.
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test && pnpm test:e2e` all green.
- [ ] User-visible behaviour is identical, including the `c` keyboard shortcut and the 10s timeout.
- [ ] `docs/architecture.svg` regenerated.

## Blocked by

- 52 — Architecture: Board context migration (exemplar)

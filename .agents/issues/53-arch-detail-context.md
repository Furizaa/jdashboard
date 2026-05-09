# 53 — Architecture: Detail context migration

**Type:** AFK

## Parent

[Clean architecture refactor PRD](../prds/clean-architecture-refactor.md)

## What to build

End-to-end migration of the ticket-detail feature into the new architecture, following the Board exemplar from slice 52. After this slice merges, `src/features/ticket-detail/` is gone; `src/contexts/detail/{domain,application,view-model,presenter,view}` exists; the detail panel renders unchanged from the user's perspective; e2e passes; `dependency-cruiser` rules pass.

The Detail context owns: panel open/close state machine (`IssuePanelState`), ADF rendering, sibling navigation within a column, keyboard shortcuts (J/K/↑/↓/O/C/Esc), Activity feed, Relationships (parent / sub-issues / linked issues), the properties rail.

Detail does **not** own: status-pill (a widget, slice 56), ticket-card / fixasap-ribbon (widgets, slice 56), MR section (a widget, slice 56). Those continue to be imported from the existing `features/<name>/` paths until slice 56 moves them; Detail's view simply uses them.

Concretely:

- **Detail domain layer** (`contexts/detail/domain/`): `extract-plain-text`, `find-siblings`, `should-handle-shortcut`. Existing tests follow.
- **Detail application layer** (`contexts/detail/application/`): tiny — Detail is mostly view-state. The application service exposes `loadIssue(key)` and `loadTransitions(key)` if those need to be coordinator-mediated; otherwise the presenter calls the coordinator's hooks directly. Hand-rolled fakes in `__fixtures__/` if any application logic exists.
- **Detail view-model layer** (`contexts/detail/view-model/`): `issue-panel-view-model.ts` — framework-free state machine over `closed | loading | error | ready` plus derivation. Replaces `useIssuePanelWithDeps`. Table-driven tests.
- **Detail presenter layer** (`contexts/detail/presenter/`): `use-issue-panel.ts` — thin React shell wiring TanStack Query, TanStack Router (`useNavigate`), and the keyboard event listeners. Sonner toasts and clipboard go through coordinator-injected adapters.
- **Detail view layer** (`contexts/detail/view/`): `IssueDetailPanel.tsx` becomes a short composition file; subcomponent extraction promotes the existing private inner components (`PanelHeader`, `CopyableIssueKey`, `OpenMrLink`, `ExternalLinkButton`, `IconButton`, `PanelBody`, `PropertiesRail`, `Field`, `PanelSkeleton`, `PanelMessage`, `NoDescription`) to named siblings. ADF rendering in `view/adf/` (the existing `adf/` subfolder moves wholesale). `Activity.tsx` and `Relationships.tsx` move to `view/`.
- **Per-context CONTEXT.md** (`contexts/detail/CONTEXT.md`) using the fixed template.
- **Barrel** exports `IssueDetailPanel` only (plus types if route consumes them).
- **Old code removed.** `src/features/ticket-detail/` is deleted.
- **Retroactive ts-pattern pass** within the migrated Detail code.
- **neverthrow** for any application-service results.
- **`useIssuePanelWithDeps` retires** — its DI shape is absorbed by the view-model + presenter split.

## Acceptance criteria

- [ ] `src/features/ticket-detail/` does not exist after this PR.
- [ ] `src/contexts/detail/{domain,application,view-model,presenter,view}` exist and are populated; `contexts/detail/view/adf/` contains the ADF renderer.
- [ ] `contexts/detail/CONTEXT.md` exists, follows the fixed template.
- [ ] `issue-panel-view-model.test.ts` exists; tests are table-driven and do not use `renderHook`.
- [ ] All `if`/`else if` ladders over result-tag fields in the migrated Detail code are replaced with `ts-pattern.match(...).exhaustive()`.
- [ ] No file under `contexts/detail/{domain, application, view-model}/` imports `react`, `@tanstack/react-*`, `sonner`, `window`, or `document`.
- [ ] No file under `contexts/detail/` imports from `~/contexts/<other>`.
- [ ] Detail's view imports widgets from their *current* locations (`~/features/status-pill`, `~/features/ticket-card`, `~/features/mr-status`) until slice 56 moves them. The dependency rule `widgets-stay-out-of-contexts` remains graduated until then.
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test && pnpm test:e2e` all green.
- [ ] User-visible behaviour is identical.
- [ ] `docs/architecture.svg` regenerated.

## Blocked by

- 52 — Architecture: Board context migration (exemplar)

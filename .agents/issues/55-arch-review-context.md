# 55 — Architecture: Review context migration

**Type:** AFK

## Parent

[Clean architecture refactor PRD](../prds/clean-architecture-refactor.md)

## What to build

End-to-end migration of the GitLab MR review queue surface into a Review context, following the Board exemplar from slice 52. The Review context is mostly server-side already (`src/server/gitlab/review-service.ts`); the client side is the MR-as-fake-card projection onto the Board grid plus the per-card review-state derivation.

After this slice merges, the cross-cutting MR-status feature is folded into either the Review context (the *cross-cutting cards*-on-the-board concern) or the `widgets/mr-section` widget (the *visual section in card / panel* concern). The split happens here so slice 56 (Widgets) has a clear scope.

Concretely:

- **Domain split decision** — the existing `src/features/mr-status/` mixes:
  - **review-state derivation** (`reviewer-state`, `review-state`, `count-unresolved`, `ci-state`) — these are kernel-level domain logic over GitLab raw shapes
  - **the visible MR section component** (`MrSection`, `MrPanelBlock`, `MrCiIndicator`, `ReviewerAvatar`, `MrWarning`) — these are widget-level visual surfaces
  
  The domain modules move to `kernel/gitlab.ts` (or a `kernel/mr/` sub-namespace). The widget visuals stay in `features/mr-status/` until slice 56.

- **Review context layout** — the Review context owns *the projection of MRs onto the Board grid as fake cards*, not the per-card MR section. Layout:
  - `contexts/review/domain/` — the projection logic (`buildReviewCards` and friends, currently in `src/server/gitlab/review-service.ts` — keep server-side as-is per scope; the *client-side projection of `GetReviewCardsResult` into board column items* is the domain logic that moves here, if any)
  - `contexts/review/application/` — review-card data hooks via the coordinator's cache port; `loadReviewCards()`. Hand-rolled fakes in `__fixtures__/`.
  - `contexts/review/view-model/` — the small state machine for "review queue" if the surface needs one (loading / error / ready)
  - `contexts/review/presenter/` — `use-review-cards.ts` (thin)
  - `contexts/review/view/` — *empty for now* — Review's visible surfaces are cards on the Board grid; the Board context renders them via `assembleColumns` which now imports the projection from `~/contexts/review`. Review has no top-level view component.
- **Coordinator dependency** — the review-cards refetch / 401-toast logic that lives in `coordinator/service.ts` (or wherever `useReviewCards` ends up after slice 51's rename) is unchanged in behaviour but referenced from `contexts/review/application/`.
- **Per-context CONTEXT.md** (`contexts/review/CONTEXT.md`) explicitly notes: "this context has no top-level view; its outputs are board column items rendered by the Board context."
- **Barrel** exports the projection function and the application service's cache hook; Board's view-model imports them.
- **Old code partially removed.** Domain modules from `features/mr-status/` move to `kernel/`; visual components stay in `features/mr-status/` until slice 56.
- **Cross-context coupling acceptable here** — Board imports Review's projection through `~/contexts/review`'s barrel. This is allowed because Review has no top-level view (no consumer-of-consumer cycle); it's a pure domain projection consumed by Board's view-model.
- **Dependency-cruiser exception** — a single graduated rule allows `contexts/board → contexts/review` for now. Slice 8 (lockdown) revisits whether the projection should move to `kernel/` to remove the cross-context edge entirely.

## Acceptance criteria

- [ ] `src/contexts/review/` exists with `application`, `presenter`, optionally `domain` and `view-model`; explicitly no `view/` subfolder.
- [ ] `contexts/review/CONTEXT.md` exists, follows the fixed template, notes the no-view design.
- [ ] Review-state domain modules (`reviewer-state`, `review-state`, `count-unresolved`, `ci-state`, `mr-status` summarisation) live under `kernel/gitlab.ts` or `kernel/mr/`.
- [ ] All `if`/`else if` ladders over result-tag fields in the migrated Review code are replaced with `ts-pattern.match(...).exhaustive()`.
- [ ] `ReviewApplicationService` (if non-trivial) returns `ResultAsync<T, E>` with tagged-error classes for `E`.
- [ ] No file under `contexts/review/{domain, application, view-model}/` (any that exist) imports `react`, `@tanstack/react-*`, `sonner`, `window`, or `document`.
- [ ] The graduated `dependency-cruiser` exception for `contexts/board → contexts/review` is documented in `.dependency-cruiser.cjs` with a comment pointing at slice 58 (lockdown).
- [ ] `src/features/mr-status/`'s visual components remain in place pending slice 56; only its domain modules have moved.
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test && pnpm test:e2e` all green.
- [ ] User-visible behaviour is identical, including the fake-MR cards in the Code Review column.
- [ ] `docs/architecture.svg` regenerated.

## Blocked by

- 52 — Architecture: Board context migration (exemplar)

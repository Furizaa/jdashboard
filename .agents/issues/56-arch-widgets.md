# 56 — Architecture: widgets refactor (status-pill, ticket-card, mr-section, fixasap-ribbon)

**Type:** AFK

## Parent

[Clean architecture refactor PRD](../prds/clean-architecture-refactor.md)

## What to build

Move the four reusable visual surfaces — `status-pill`, `ticket-card`, `mr-section`, `fixasap-ribbon` — out of `features/` into a peer `widgets/` folder, applying the compound-API pattern only where 2+ consumer layouts exist (mr-section), subcomponent extraction everywhere, and shadcn primitives into `design-system/` on second-use triggers.

After this slice merges, `src/features/` contains only what is genuinely cross-cutting infrastructure that didn't fit a context or widget (e.g. `auth-status`, `header` — which the next clean-up step decides on); the widget surfaces all live in `src/widgets/{name}/`; contexts depend on widgets via barrels; widgets depend on the coordinator for actions but never on contexts.

Concretely:

### widgets/status-pill

- Move `StatusPill`, `StatusPillSelect`, `StatusIcon`, `status-color`, `status-display-name`, `transition-resolver` to `widgets/status-pill/`.
- Internal split: `view/StatusPill.tsx` (display), `view/StatusPillSelect.tsx` (display + dropdown), `view-model/status-pill-select-view-model.ts` (open/closed + transitions phase), `presenter/use-status-pill-select.ts` (TanStack Query for transitions, coordinator for transition action), `domain/transition-resolver.ts`, `domain/status-display-name.ts`, `domain/status-color.ts`.
- Barrel exports `StatusPill` and `StatusPillSelect` only.

### widgets/ticket-card

- Move `TicketCard`, `TypeIcon`, `FixasapRibbon` (note: shared with widgets/fixasap-ribbon — see below), `hash-color`, `type-styles`, `build-card-view`, `fixasap` to `widgets/ticket-card/`.
- The `build-card-view` module is *view-model derivation* — keep as `view-model/build-card-view.ts`. The view component reads from it.
- Subcomponent extraction: `view/TicketCard.tsx`, `view/CardHeader.tsx`, `view/CardKey.tsx`, `view/EpicChip.tsx`, `view/CardLabels.tsx`. Compound API NOT introduced — single consumer layout.

### widgets/mr-section (compound API)

- Move `MrSection`, `MrPanelBlock`, `MrCiIndicator`, `MrWarning`, `ReviewerAvatar` to `widgets/mr-section/`.
- **This is the only widget with a true compound API** because there are 2 consumer layouts (card row vs. panel block):
  - `view/Mr.tsx` — namespace export: `Mr.Root`, `Mr.ReviewerRow`, `Mr.ReviewerStack`, `Mr.CiIndicator`, `Mr.UnresolvedChip`, `Mr.WarningRow`, `Mr.OpenLink`
  - `Mr.Root` carries the MR summary via React context; parts pull what they need
  - The two consumers (`widgets/ticket-card/view/TicketCard.tsx` and `contexts/detail/view/PanelBody.tsx`) compose different parts:
    - Card: `<Mr.Root summary={summary}><Mr.ReviewerRow /><Mr.CiIndicator /><Mr.UnresolvedChip /></Mr.Root>`
    - Panel: `<Mr.Root summary={summary}><Mr.ReviewerStack /><Mr.WarningRow /><Mr.OpenLink /></Mr.Root>`
- The MR summary derivation (already in `kernel/` after slice 55) is consumed via the coordinator's cache hooks (presenter level).

### widgets/fixasap-ribbon

- Move `FixasapRibbon` from `features/ticket-card/` to `widgets/fixasap-ribbon/` (it's a single component, no view-model needed). Imported by `widgets/ticket-card` and `contexts/detail/view/IssueDetailPanel`.

### design-system on second-use trigger

- Audit second-use primitives that emerged during context migrations. Likely candidates: a popover for status-pill's dropdown (also used by capture's parent select?), a button base style, a skeleton component used by board / detail / mr-section.
- For each second-use, pull in the corresponding shadcn component via `npx shadcn add <name>` into `src/design-system/`. Refactor existing inline definitions to import from `~/design-system/`.
- Single-use primitives stay inline; the trigger is *use elsewhere*, not *exists elsewhere*.

### Cleanup

- `src/features/status-pill/`, `src/features/ticket-card/`, `src/features/mr-status/`, `src/features/header/GitlabIndicator.tsx` (if it imports the moved bits) and any FixasapRibbon stragglers all updated; `src/features/` now contains only `auth-status` and `header` (or whatever didn't move). Those two stay in `features/` for now and are addressed in slice 58 (lockdown) — typically by lifting `header` into the route layer and `auth-status` into a thin context or coordinator-adjacent module.
- `dependency-cruiser` rules tightened: `widgets/<any> → contexts/<any>` is now `error`; `widgets/<any> → @tanstack/react-query` outside its own `presenter/` is now `error`.
- Detail context (slice 53) imports updated: `~/features/status-pill` → `~/widgets/status-pill`, etc.
- Board / Capture context imports updated similarly.
- Retroactive ts-pattern pass for the migrated widget code.

## Acceptance criteria

- [ ] `src/widgets/{status-pill,ticket-card,mr-section,fixasap-ribbon}` exist and are populated.
- [ ] `src/features/{status-pill,ticket-card,mr-status}` do not exist after this PR.
- [ ] `widgets/mr-section/view/Mr.tsx` exposes a namespace-style compound API; the two consumer layouts (card row, panel block) are composed at the call sites.
- [ ] `widgets/ticket-card/view-model/build-card-view.ts` exists; its tests follow.
- [ ] At least one shadcn primitive lives under `src/design-system/` (whichever second-use trigger fired during context migrations).
- [ ] Single-use primitives remain inline; design-system is not over-populated.
- [ ] No file under `widgets/<name>/` imports from `~/contexts/<any>`.
- [ ] No file under `widgets/<name>/` outside `presenter/` imports `@tanstack/react-query`.
- [ ] All `if`/`else if` ladders over result-tag fields in the migrated widget code are replaced with `ts-pattern.match(...).exhaustive()`.
- [ ] All context imports of widgets resolve to `~/widgets/<name>` (no `~/features/<widget>` strings remain).
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test && pnpm test:e2e` all green.
- [ ] User-visible behaviour is identical, including the FIXASAP ribbon, the MR CI indicator, and the panel MR block.
- [ ] `docs/architecture.svg` regenerated; the widgets layer is visible.

## Blocked by

- 53 — Architecture: Detail context migration
- 54 — Architecture: Capture context migration
- 55 — Architecture: Review context migration

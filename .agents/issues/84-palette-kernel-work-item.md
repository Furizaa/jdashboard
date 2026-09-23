# 84 — Palette kernel: `WorkItem`, the action-kind shortcut map, and ADR-0008

**Type:** AFK

## Parent

[Command Palette PRD](../prds/command-palette.md)

## What to build

The vocabulary the whole feature is built on, plus the decision record that authorises it. **No UI
in this slice** — nothing the user can see changes. It exists so slices 85–88 all speak the same
type language, and so the architectural choice is recorded before any structure depends on it.

### `src/kernel/work-item.ts`

Promote `WorkItem` from CONTEXT-MAP's glossary ("candidate term — not yet adopted") to a real type.
It is the unified handle on anything the palette can find, across all three sources.

- `WorkItem` — a discriminated union over the three sources the palette searches:
  - a Jira-assigned board issue (`BoardIssue`),
  - a watchlist card,
  - a review card, which is itself already a union of `review-real` (carries `jira.key`) and
    `review-fake` (an MR with no resolvable Jira key).

  Model the discriminant so `ts-pattern.exhaustive()` works over it. The important distinction the
  rest of the feature reads off is **"does this item have a Jira ticket behind it?"** — that single
  predicate gates almost every action's legality in slice 86.

- `workItemId(item): string` — stable identity. Reuse `reviewCardId()` from `kernel/review.ts` for
  review cards rather than inventing a second scheme.

- `workItemHaystack(item): string` — lowercased search text. Reuse the shapes that already exist:
  `` `${key} ${summary}` `` for Jira-backed items and the `` `MR !${iid} ${title}` `` form from
  `reviewSearchHaystack()`. Do not duplicate that function — extend or call it.

- `dedupeWorkItems(items): readonly WorkItem[]` — the same ticket can arrive from more than one
  source (an assigned ticket that is also on the watchlist; a `review-real` card whose `jira.key`
  matches an assigned issue). Collapse by Jira key when there is one, else by `workItemId`.
  **Precedence must be deliberate and documented in a comment**: the surviving item should be the
  one carrying the most actionable state. Decide the order, write it down, and test it — a silently
  wrong precedence here shows up as missing actions three slices later.

### `src/kernel/commands.ts`

- `ActionKind` — a string-literal union naming every action in the PRD's shortcut table. This is the
  discriminant slices 86–88 match exhaustively, so adding an action later is a compile error until
  every match arm handles it. That is the point.
- `ACTION_SHORTCUTS: Record<ActionKind, string>` — the curated static map from the PRD table.
- `ActionGroup` — the grouping used for section headers in the action list (e.g. workflow / links /
  workspace / AI). Keep it small; it is presentation grouping, not domain.
- A **uniqueness assertion over the shortcut map** that fails loudly in development if two action
  kinds claim the same key. A plain module-level check that throws is fine; it must also be covered
  by a unit test asserting the current map is collision-free. This is the guard that keeps the
  curated-map decision honest as actions get added.

Re-export both modules from `src/kernel/index.ts`, matching the existing barrel style.

### `docs/adr/0008-command-palette-action-catalogue.md`

Record the two decisions this feature rests on, in the established ADR format (see
`docs/adr/0007-multi-board-app-shell.md` and `.agents/skills/grill-with-docs/ADR-FORMAT.md`):

1. **The palette context owns the flow and never imports another context.** Actions arrive as plain
   `PaletteAction` descriptors; the cross-context assembly lives in `routes/-command-palette/`.
   Considered and rejected: (a) the palette importing six contexts directly (breaks `no-cross-context`);
   (b) a coordinator-hosted action registry — precedented by the coordinator's existing barrel
   re-exports of `~/contexts/{tags,watchlist,review}`, but that is barrel-laundering past
   `coordinator-cant-see-context-views` and should not be leaned on for ~25 actions; (c) all of it in
   `routes/`, where there is no layer structure and the ranking and legality rules become untestable.
2. **`WorkItem` is promoted to a kernel type**, with the dedupe rationale above.

Also record the two consequences worth stating plainly: the palette has **no `application/` layer**
(it owns no gateway — precedented by `contexts/tags/`), and **`cmdk` is not adopted** because it would
own state ADR-0003 assigns to the view-model.

## Acceptance criteria

- [ ] `src/kernel/work-item.ts` exports `WorkItem`, `workItemId`, `workItemHaystack`, and
      `dedupeWorkItems`; `WorkItem` is exhaustively matchable via `ts-pattern`.
- [ ] `workItemHaystack` reuses `reviewSearchHaystack`'s existing text shape rather than duplicating it.
- [ ] `src/kernel/work-item.test.ts` covers: identity for each source; haystack text for a
      Jira-backed item and a fake review card; dedupe collapsing the same Jira key arriving from two
      sources, with an explicit assertion on **which** item survives.
- [ ] `src/kernel/commands.ts` exports `ActionKind`, `ACTION_SHORTCUTS`, and `ActionGroup`;
      `ACTION_SHORTCUTS` covers every kind in the PRD table with the PRD's letters.
- [ ] A shortcut-collision check exists and throws in development; `src/kernel/commands.test.ts`
      asserts the shipped map has no collisions and that every `ActionKind` has an entry.
- [ ] Both modules are re-exported from `src/kernel/index.ts`.
- [ ] `docs/adr/0008-command-palette-action-catalogue.md` exists, follows the house ADR format, and
      records both decisions with their rejected alternatives.
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm test` all green.
- [ ] `pnpm check:arch` is no worse than master. It is **advisory** — it already fails on master on
      pre-existing circular deps and intentional per-context duplication. Do not chase it green.
- [ ] No behaviour change: nothing imports the new modules yet, and the app is visually identical.

## Blocked by

None — can start immediately.

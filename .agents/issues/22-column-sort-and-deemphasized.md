# 22 — Per-column sort + TO DO deemphasized tier

**Type:** AFK

## Parent

[Misc improvements PRD](../prds/misc-improvements.md)

## What to build

Two related changes that share one pure module: per-column sort rules plus a dim treatment for non-actionable TO DO cards.

- New pure module `src/features/board/sort-column.ts`:
  - Public function `sortColumnIssues(issues, column)`.
  - For `'TO DO'`: `Reviewed` cards first, then everything else; Jira `rank` order within each tier. Status comparison is case-insensitive (consistent with the existing `status-mapping` module and the recorded HDR Jira casing behaviour).
  - For `'Done'`: status order STG → QA → UAT → Done, Jira `rank` within each status group; status comparison is case-insensitive.
  - For `'In Implementation'` and `'In Code Review'`: pass-through (returns input order).
  - The status-tier and status-group orderings live as small `readonly` arrays inside the module — no public API beyond the single function.
- New pure module `src/features/board/deemphasize.ts`:
  - Public function `isDeemphasized(issue, column)` returning `true` when `column === 'TO DO'` and the issue's status is anything other than `Reviewed` (case-insensitive). `false` everywhere else.
- `src/features/board/Board.tsx` integration:
  - In the `itemsByColumn` assembly, run each column's items through `sortColumnIssues` before they reach `BoardColumn`. The sort applies after filtering and after change-indication state assignment, so that newly-entering and currently-leaving cards still land in their correct sorted position.
- `src/features/ticket-card/TicketCard.tsx` integration:
  - Apply `opacity-60` to the outer `<article>` container's class list when `isDeemphasized(issue, column)` is true. The dim is whole-card; no per-element overrides.
  - The `column` prop already exists on `TicketCard` (introduced in slice 17 for `MrSection`); reuse it.
- `src/features/board/index.ts` barrel exports the two new modules.
- Tests (Vitest), colocated:
  - `sort-column.test.ts`:
    - TO DO with mixed `Reviewed`, `Blocked`, and unknown statuses → two-tier output, Jira rank within each tier, case-insensitive status match.
    - Done with all four statuses interleaved → STG → QA → UAT → Done order, Jira rank within each group.
    - In Implementation and In Code Review → pass-through (input order preserved).
    - Empty input.
    - Single-status input (all `Reviewed`, all STG, etc.).
    - Stability when two issues share the same `rank`.
  - `deemphasize.test.ts`:
    - `Reviewed` in TO DO → false; `Blocked` in TO DO → true; unknown status in TO DO → true.
    - Any status in In Implementation, In Code Review, Done → false.
    - Case-insensitive status comparison.
- Composition layers (Board sort wiring, TicketCard opacity wiring) are manually verified per the PRD's testing decisions.

## Acceptance criteria

- [ ] In the TO DO column, all `Reviewed` cards render at the top of the column at full opacity; all other cards render below at `opacity-60`.
- [ ] Both tiers within the TO DO column are ordered by Jira `rank`.
- [ ] The dim treatment applies to the entire card uniformly — title, key, status pill, labels, and any MR section.
- [ ] In the Done column, cards render in status order STG → QA → UAT → Done, with Jira `rank` within each status group.
- [ ] No extra dividers or spacing between Done-column status groups.
- [ ] In Implementation and In Code Review columns are unchanged in order.
- [ ] Status comparisons in both modules are case-insensitive.
- [ ] `sort-column.test.ts` and `deemphasize.test.ts` cover the cases listed above.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

None — can start immediately.

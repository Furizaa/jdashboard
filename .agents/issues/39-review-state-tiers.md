# 39 — Review-state sort tiers + Review Rejected deemphasis + READY TO PICK rename

**Type:** AFK

## Parent

[GitLab MR review cards PRD](../prds/gitlab-mr-review-cards.md)

## What to build

Three loosely related polish changes that finalize how review-mode cards land in the lanes alongside Jira-work cards. Bundled together because they all touch the same two pure modules (`sort-column`, `deemphasize`) and the status-pill display layer.

- Extend `src/features/board/sort-column.ts`:
  - **TO DO** tier order: `Needs Review` (top, full opacity) → `READY TO PICK` (the existing `Reviewed` tier) → `Review Rejected` → `Blocked` (deemphasized).
    - The function already operates on `statusName` strings; review-state cards expose their bucket via a status-name-equivalent (e.g. `'Needs Review' | 'Review Rejected' | 'Review Accepted'`). Tier matching is case-insensitive, consistent with the existing module.
  - **Done** tier order: `In STG` → `In QA` → `In UAT` → `Done` → `Review Accepted` (bottom).
  - In Implementation and In Code Review: pass-through (unchanged).
  - The internal tier arrays are extended; the public function signature is unchanged.
- Extend `src/features/board/deemphasize.ts`:
  - Generalize the hardcoded "TO DO and not Reviewed" rule into a `(lane, status) → boolean` lookup table.
  - Final entries:
    - `'TO DO'` × `'Reviewed'` (a.k.a. `READY TO PICK`) → `false`
    - `'TO DO'` × `'Needs Review'` → `false`
    - `'TO DO'` × `'Review Rejected'` → `true`
    - `'TO DO'` × any other (`Blocked`, unknown statuses) → `true`
    - All other lanes → `false` (Done has no de-emphasis tier in this PRD).
  - Status comparison stays case-insensitive.
  - Public signature `isDeemphasized(issue, column)` is unchanged; only the rule is generalized.
- `READY TO PICK` rename:
  - Add a display-name override layer in `src/features/status-pill/status-color.ts` (or a sibling small module): given a Jira status string, return the user-facing label. Default returns the input verbatim; the only override is `'reviewed'` → `'READY TO PICK'`.
  - `StatusPill` (and any other surface that renders the pill text — properties rail, transitions dropdown items if any) uses the display-name layer when rendering text.
  - The underlying string in `BoardIssue.statusName`, in `sort-column`'s tier matching, in JQL, in `deemphasize`'s lookup, and in the transitions API stays `Reviewed`. Rename is presentation-only.
- Tests (Vitest), colocated:
  - `sort-column.test.ts` — extend the existing test file:
    - TO DO tier order with a mix of `Needs Review`, `Reviewed`, `Review Rejected`, `Blocked`, and unknown statuses → matches the new four-tier order.
    - Stable secondary order within each tier (existing rank-based behaviour preserved).
    - Done tier order including `Review Accepted` at the bottom.
    - Empty input.
    - Single-tier-only inputs.
    - Case-insensitive status comparison.
  - `deemphasize.test.ts` — extend the existing test file:
    - All combinations of (lane × status) including the new `Review Rejected` and `Needs Review` entries.
    - Case-insensitive comparison.
  - Display-name override (Vitest):
    - `'Reviewed'` → `'READY TO PICK'`.
    - `'reviewed'` (lowercase) → `'READY TO PICK'`.
    - All other Jira statuses pass through verbatim.
- Composition layers (Board sort wiring, TicketCard pill text wiring) are manually verified per the PRD's testing decisions.

## Acceptance criteria

- [ ] In the TO DO column, cards render top-to-bottom in the order `Needs Review` → `READY TO PICK` (formerly displayed as "Reviewed") → `Review Rejected` → `Blocked` and other deemphasized statuses.
- [ ] `Needs Review` and `READY TO PICK` cards render at full opacity.
- [ ] `Review Rejected` and `Blocked` cards render at `opacity-60` (the existing dim treatment), with the dim applied to the entire card uniformly.
- [ ] In the Done column, cards render in the order `In STG` → `In QA` → `In UAT` → `Done` → `Review Accepted`.
- [ ] No de-emphasis is applied to any card in the Done column (including `Review Accepted`).
- [ ] In Implementation and In Code Review columns are unchanged in order and de-emphasis behaviour.
- [ ] Wherever the pill text is rendered for the Jira `Reviewed` status, the user sees `READY TO PICK` (status pill on cards, status pill in the detail panel's properties rail).
- [ ] The underlying Jira string `Reviewed` is unchanged everywhere it is used internally — sort tier matching, de-emphasize rule lookup, JQL, transitions dropdown's Jira-side names.
- [ ] `sort-column.test.ts` and `deemphasize.test.ts` are extended to cover the new tier orderings and the new lane × status entries; the display-name override is unit-tested.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

- [38 — Review-mode cards end-to-end (spine)](./38-review-cards-spine.md)

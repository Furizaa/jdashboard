# 25 — FIXASAP corner ribbon

**Type:** AFK

## Parent

[Misc improvements PRD](../prds/misc-improvements.md)

## What to build

A small red filled triangle in the top-right corner of any card (and any open detail panel) carrying the literal `FIXASAP` label, case-insensitive.

- New pure module `src/features/ticket-card/fixasap.ts`:
  - Public function `hasFixasapLabel(labels)` returning `true` when any label in the list lowercases to the literal string `"fixasap"`. Exact-string match after lowercasing — hyphenated, punctuated, or substring variants do not match.
- New component `src/features/ticket-card/FixasapRibbon.tsx`:
  - A small filled red triangle in the top-right corner of the parent container. Implementation: an absolutely-positioned element with a CSS `clip-path` triangle (or an SVG triangle) — whichever fits the existing token vocabulary best. Color: red (use the existing destructive token if applicable, otherwise a `bg-red-500`-style class to match the urgency palette).
  - Sized small on the card (~14px) and proportionally larger on the panel container (~20–24px).
  - Static — no animation, no pulse, no hover interaction.
  - Includes an `aria-label` like "Urgent (FIXASAP)" for accessibility; otherwise visual-only.
  - Takes a `size` prop (`'card' | 'panel'`) so the same component drives both surfaces.
- Wire into `src/features/ticket-card/TicketCard.tsx`:
  - The `<article>` root needs `relative` positioning (verify it already is, otherwise add it) so the absolutely-positioned ribbon anchors correctly.
  - Render `<FixasapRibbon size="card" />` inside the `<article>` when `hasFixasapLabel(issue.labels)` is true.
  - The label dot for `FIXASAP` is *kept* in the labels row — no suppression. This is an explicit decision from the PRD.
  - The opacity-60 dim from slice 22 also applies to the ribbon when the card is in the deemphasized tier — the ribbon shares the card's opacity, no override.
- Wire into `src/features/ticket-detail/IssueDetailPanel.tsx`:
  - Render `<FixasapRibbon size="panel" />` inside the panel container when the loaded `issue.labels` contains a FIXASAP match. The ribbon anchors to the top-right of the panel's outer rounded container (the element that holds the panel header + body).
  - The panel container needs `relative` positioning if it is not already.
- Extend `src/features/ticket-card/index.ts` to export `hasFixasapLabel` and `FixasapRibbon`.
- Tests (Vitest), colocated:
  - `fixasap.test.ts`:
    - Exact `FIXASAP` → true.
    - Lowercase `fixasap` → true.
    - Mixed case `FixAsap`, `fixASAP` → true.
    - No match (`URGENT`, `FIX-ASAP`, `FIX_ASAP`, `FIXASAPS`, `FIXAS`) → false.
    - Empty labels list → false.
    - Multiple labels with one match → true.
- The `<FixasapRibbon>` component itself is composition; manually verified on the running app per the PRD.

## Acceptance criteria

- [ ] Cards carrying a label that lowercases to `"fixasap"` render a small red filled triangle in the top-right corner.
- [ ] The match is case-insensitive on the literal string — `FIXASAP`, `fixasap`, `FixAsap` all trigger; `FIX-ASAP`, `URGENT`, similar-but-not-equal labels do not.
- [ ] The triangle is static — no animation, no pulse.
- [ ] The `FIXASAP` label dot remains visible in the labels row of the card (not suppressed).
- [ ] When a FIXASAP card is in the TO DO deemphasized tier (slice 22), the triangle dims with the rest of the card at `opacity-60`.
- [ ] When a FIXASAP card has a fully-approved-and-clean MR (green section tint), the triangle and the green tint coexist — both are visible, neither is suppressed.
- [ ] Opening a FIXASAP ticket in the detail panel renders the same triangle (scaled larger) in the top-right corner of the panel container.
- [ ] Opening a non-FIXASAP ticket in the panel renders no triangle.
- [ ] `fixasap.test.ts` covers the case-insensitivity, exact-match, no-match, and empty-labels cases.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

None — can start immediately.

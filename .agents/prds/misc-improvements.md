# clashboard — column sorting, MR CI/conflict, panel MR section, FIXASAP ribbon

## Problem Statement

The board works, and the GitLab MR row works, but several friction points remain in daily use:

- The TO DO column mixes actionable `Reviewed` cards with not-yet-actionable `Blocked` (and other) cards. They render at the same visual weight, so I cannot tell at a glance which TO DO cards I should pick up next.
- The Done column orders cards by Jira rank, which means STG / QA / UAT / Done states scatter through the column unpredictably. I want the column to read as a verification pipeline — staging at the top, shipped at the bottom.
- The MR review row tells me about reviewers and unresolved threads, but says nothing about the *non-review* state of the MR. If CI is failing or there is a merge conflict, I find out about it by clicking through to GitLab. Both of those signals are blocking; both belong on the card.
- The detail panel currently has no MR information at all. Everything I learned at a glance on the card I have to re-derive from a tooltip — and the panel has plenty of space to spell that out directly.
- I have a `FIXASAP` label for tickets that need to jump the queue, but it renders as just another label dot. It does not stand out, which defeats the point of having it.

## Solution

A small bundle of board-polish improvements:

- TO DO column splits into two tiers — `Reviewed` cards on top at full opacity, every other status below at reduced opacity — both sorted by Jira rank within their tier.
- Done column sorts by status (STG → QA → UAT → Done), Jira rank within each status group.
- Code Review cards gain a single CI/conflict indicator on the right of the reviewer row, just before the unresolved-comments chip. The indicator collapses four pipeline states plus the conflict bit into one slot, with a precedence rule so the most actionable signal wins.
- The detail panel grows a Merge Request block in the right-side properties rail. It mirrors the card's display states (review row, draft warning, no-reviewers warning, merged warning, no-MR warning, Done desync warning) but has space to spell out per-reviewer state explicitly. A new "Open MR" icon button appears in the panel header next to the existing "Open in Jira" button when a matching MR exists.
- Cards (and the detail panel) carrying the literal `FIXASAP` label render a small red filled triangle in their top-right corner, regardless of the rest of their state.

All of this builds on the existing modules — no new GitLab endpoints, no new env vars, no new top-level dependencies.

## User Stories

1. As a developer, I want `Reviewed` cards in the TO DO column to render at the top of the column above `Blocked` and any other not-yet-actionable cards, so that the next ticket I should pick up is always immediately above the column header.
2. As a developer, I want non-`Reviewed` cards in the TO DO column rendered at reduced opacity, so that I can see they exist but immediately recognise them as not-yet-actionable.
3. As a developer, I want both tiers within the TO DO column sorted by Jira `rank`, so that the order remains stable and matches the rest of the board's default ordering.
4. As a developer, I want the dim treatment to apply to the entire card — title, key, status pill, labels — so that the deemphasized tier reads as a single visual unit rather than a partially-dimmed card.
5. As a developer, I want cards in the Done column ordered STG → QA → UAT → Done, so that the column reads as a verification pipeline from top (just shipped) to bottom (released).
6. As a developer, I want Done-column cards within the same status group ordered by Jira `rank`, so that the secondary order is stable and matches the rest of the board.
7. As a developer, I want no extra dividers or spacing between Done-column status groups, so that the column stays visually quiet — the status pills already encode the grouping.
8. As a developer, I want every Code Review card with an MR to show a single CI/conflict indicator on the right of the reviewer row, so that I can see CI status and conflict state at a glance without leaving the board.
9. As a developer, I want a merge conflict to take precedence over CI status on the indicator, so that the most blocking signal is the one I see when both are present.
10. As a developer, I want the indicator to render as a colored lucide icon (amber `AlertTriangle` for conflict, red `XCircle` for failed, muted spinning `Loader2` for running, green `CheckCircle` for passed), so that the state reads at a glance without me having to hover.
11. As a developer, I want hovering the indicator to show the underlying state in a native `title` tooltip, so that I can confirm what I am looking at if the icon shape is ambiguous.
12. As a developer, I want no indicator rendered when the MR has no pipeline at all (`head_pipeline === null`), so that the slot stays empty when there is nothing to say.
13. As a developer, I want the CI/conflict indicator suppressed on the draft / no-reviewers / merged warning rows, so that the warning row stays focused on its lifecycle message rather than mixing in CI noise.
14. As a developer, I want the CI/conflict indicator placed before the unresolved-comments chip, so that both status-summary affordances stay grouped on the right of the row while reviewer identity stays on the left.
15. As a developer, I want the detail panel to surface the same MR information as the card, so that opening a panel never loses information that was visible on the board.
16. As a developer, I want the panel's MR block to live in the right-side properties rail, so that the body of the panel stays focused on description and relationships.
17. As a developer, I want the rail to keep its current 180px width, so that the description body does not lose horizontal space.
18. As a developer, I want each reviewer rendered as a stacked multi-line block (avatar + display name + state badge text), so that I can read each reviewer's state without hovering for a tooltip.
19. As a developer, I want the panel's MR block to surface CI/conflict using the same indicator as the card, so that the visual vocabulary stays consistent across both surfaces.
20. As a developer, I want the panel's MR block to render the merged / draft / no-reviewers / no-MR / desync warning states with the same precedence as the card, so that the panel mirrors the card's logic and never tells a different story.
21. As a developer, I want the panel's MR block to render the section-level green tint when every reviewer has approved cleanly, so that the "ready to merge" celebration is visible from both surfaces.
22. As a developer, I want an "Open MR" icon button in the panel header next to "Open in Jira", so that I have a one-click escape to the MR without scanning the body.
23. As a developer, I want the "Open MR" button hidden when no matching MR exists, so that an empty action is never offered.
24. As a developer, I want the panel's MR block shown whenever a matching MR exists regardless of column, so that the panel is the place where all known facts about a ticket are surfaced — even when the card-level rule says to stay quiet.
25. As a developer, I want every card carrying the literal `FIXASAP` label to render a small red filled triangle in the top-right corner, so that urgent tickets are visible at a glance from anywhere on the board.
26. As a developer, I want the corner triangle to be label-text-free (a flat red triangle, no overlay text), so that the visual stays restrained while still being unmissable.
27. As a developer, I want the FIXASAP detection to be case-insensitive on the literal label string, so that `FIXASAP`, `fixasap`, and `FixAsap` all trigger the ribbon.
28. As a developer, I want the FIXASAP triangle to also render in the detail panel, so that closing the panel and looking at the card never loses urgency information.
29. As a developer, I want the FIXASAP label dot kept in the labels row of the card, so that the label remains discoverable through its normal channel rather than being swapped for a single visual element.
30. As a developer, I want the FIXASAP triangle and the green-clean-MR section tint to coexist without conflict, so that an urgent ticket whose MR is ready to merge surfaces both signals — they are reinforcing, not competing.
31. As a developer, I want the FIXASAP triangle to be static (no pulse, no animation), so that it reads as an inherent attribute of the ticket rather than a transient state.

## Implementation Decisions

### Sort comparator

A new pure module exposing `sortColumnIssues(issues, column)`. Single source of truth for the per-column sort rules:

- **TO DO**: `Reviewed` first, then everything else; Jira `rank` within each tier.
- **Done**: status order STG → QA → UAT → Done, with Jira `rank` within each status group.
- **In Implementation / In Code Review**: pass-through (current Jira `rank` order).

Status comparisons inside the comparator are case-insensitive (consistent with the existing `status-mapping` module and the recorded HDR Jira behaviour).

### Deemphasized predicate

A pure boolean module `isDeemphasized(issue, column)`. Returns `true` for non-`Reviewed` cards in the TO DO column, `false` everywhere else. The card applies `opacity-60` to its outer container when this returns true, dimming the entire card uniformly. No per-element opacity overrides; the ribbon (when present) and any other visual elements share the same opacity.

### CI / conflict visual state

A pure module `ciVisualState({ headPipelineStatus, hasConflicts })` mapping the two GitLab signals to one of `'conflict' | 'failed' | 'running' | 'passed' | 'none'`. Precedence: `hasConflicts` → `conflict`; otherwise pipeline `failed | canceled` → `failed`; otherwise pipeline `running | pending` → `running`; otherwise pipeline `success` → `passed`; otherwise (`null`, `skipped`, or anything else) → `none`.

The state is computed inside `summarizeMr` and stored on the `'review'` kind only. The other kinds (merged / draft / no-reviewers) deliberately do not carry it because the card and the panel both suppress CI on those states.

### MR summary type

The `MrSummary` discriminated union gains a `ciState` field on the `'review'` variant. The other variants are unchanged. The `MrCiIndicator` component reads this field directly; nothing else cares.

### GitLab data fetching

No new endpoints. The existing `getMr` call already returns `head_pipeline` and `has_conflicts`. The `GitlabMrDetail` type gains `head_pipeline: { status: string } | null` and `has_conflicts: boolean` fields; `client.ts` is otherwise unchanged.

### FIXASAP detection

A pure boolean module `hasFixasapLabel(labels)` matching the literal label string `FIXASAP` case-insensitively. Lives in the `ticket-card` feature alongside `hash-color`. The comparison is exact-string equality (after lowercasing) — hyphenated or punctuated variants do not trigger the ribbon.

### Card layout changes

- Outer container applies `opacity-60` when `isDeemphasized(issue, column)` is true; no other change.
- A `<FixasapRibbon />` element renders inside the card when `hasFixasapLabel(issue.labels)` is true. It is positioned absolutely in the top-right corner via Tailwind utility classes (e.g. a small `before:`/`after:` triangle or a 12-16px filled triangle SVG). It does not affect card content layout.
- The `MrSection` reviewer row gains the CI indicator slot on the right, immediately before the unresolved-comments chip. When `ciState === 'none'` the slot renders nothing.

### Detail panel changes

- The properties rail keeps its 180px width. The existing `Field`-style blocks (Status, Type, Priority, Assignee, Reporter, Labels) remain.
- A new "Merge Request" rail block renders below the existing fields when a matching MR exists. Its content depends on the `MrSummary` kind:
  - `merged` / `draft` / `no-reviewers`: a compact warning row with the same icon and amber palette as the card.
  - `review`: the CI indicator inline at the top, then a stacked list of reviewer blocks (avatar + name + state badge text), then the unresolved-count chip. When `allApprovedAndClean`, the entire block takes on the green tint with the existing left accent treatment.
  - Done-column desync (still-open MR on a Done card): the same desync warning that appears on the card today.
  - No matching MR: nothing rendered; the rail block is absent rather than showing an explanatory placeholder.
- A new "Open MR" icon button appears in the panel header next to the "Open in Jira" link, using the same lucide `ExternalLink` icon. It is hidden (not disabled) when no matching MR exists. Clicking opens `mrSummary.webUrl` in a new tab.
- The FIXASAP corner triangle renders in the panel container (not just the card), scaled to match the panel's larger surface so it stays visually proportional.

### Polling, caching, change-indication

No changes. The MR query already polls at 1 minute and refetches on tab focus; CI state and conflict state ride the same cycle. The `useChangeIndication` hook keys off Jira issue keys and statuses; CI state changes are not change-indicated, consistent with reviewer state changes today.

### Module summary

- **`sortColumnIssues`** (pure, board feature): per-column sort rules, single source of truth.
- **`isDeemphasized`** (pure, board feature): boolean predicate driving the TO DO opacity treatment.
- **`ciVisualState`** (pure, mr-status feature): pipeline + conflict precedence reduction.
- **`hasFixasapLabel`** (pure, ticket-card feature): case-insensitive literal-label match.
- **`summarizeMr`** (existing, extended): now also derives `ciState` for `'review'` MRs.
- **`<MrCiIndicator>`** (component, mr-status feature): renders the lucide icon for a given `ciState`. Used by both card and panel.
- **`<FixasapRibbon>`** (component, ticket-card feature): the corner triangle. Used by both card and panel.
- **`<MrSection>`** (existing, extended): new CI-indicator slot on the review row.
- **`<MrPanelBlock>`** (new, mr-status feature): the rail-side rendering of the MR summary, mirroring `<MrSection>` but laid out for the rail.
- **`<TicketCard>`** (existing, extended): opacity wiring + ribbon.
- **`<IssueDetailPanel>`** (existing, extended): rail block + "Open MR" header button + ribbon.
- **`<Board>`** (existing, extended): wires `sortColumnIssues` into the per-column item assembly.

## Testing Decisions

### What makes a good test

Same principle as the existing PRDs: tests assert each module's input/output contract, not its internal structure. Pure-function modules are tested directly with input/output. React components that are mostly composition are validated by manually opening the running app, not unit tests.

### Modules to test (Vitest)

- **`sortColumnIssues`** — table-driven: TO DO with mixed `Reviewed` / `Blocked` / unknown statuses (correct two-tier order, Jira rank within each tier, case-insensitive status match); Done with all four statuses interleaved (correct STG → QA → UAT → Done order, Jira rank within each group); In Implementation and In Code Review pass-through; empty input; single-status input; stability when two cards share a rank.
- **`ciVisualState`** — table-driven: every `head_pipeline.status` value (`null`, `success`, `running`, `pending`, `failed`, `canceled`, `skipped`) crossed with `hasConflicts` true/false; assert the precedence rule (conflict beats every pipeline state).
- **`hasFixasapLabel`** — exact `FIXASAP`, lowercase `fixasap`, mixed case `FixAsap`, no match (`URGENT`, `FIX-ASAP`, similar-but-not-equal labels), empty labels list, multiple labels with one match.
- **`isDeemphasized`** — `Reviewed` in TO DO → false; `Blocked` in TO DO → true; unknown status in TO DO → true; any status in In Implementation / In Code Review / Done → false; case-insensitive status comparison.

### Modules not tested at the unit level

- `<MrCiIndicator>`, `<FixasapRibbon>`, `<MrPanelBlock>`, the `<MrSection>` extension, the rail rewrite in `<IssueDetailPanel>`, the sort wiring in `<Board>`, and the opacity wiring in `<TicketCard>`. Composition layers; manually verified against the running app.
- `summarizeMr`'s extension to compute `ciState` is covered transitively through `ciVisualState` tests; no new fixture-heavy tests are added for `summarizeMr` itself.

### Prior art

- `features/board/status-mapping.test.ts` and `features/board/filter-issues.test.ts` are the templates for the sort and predicate tests.
- `features/mr-status/reviewer-state.test.ts` and `features/mr-status/count-unresolved.test.ts` are the templates for the `ciVisualState` test.
- `features/ticket-card/hash-color.test.ts` is the template for the `hasFixasapLabel` test.

## Out of Scope

- Per-reviewer unresolved-thread counts in the panel rail. The section-level unresolved chip stays the only quantitative signal.
- Grouping reviewers by state in the panel ("Approved (2)", "Pending (1)"). Each reviewer is its own row.
- Animating the FIXASAP triangle, the CI indicator, or the opacity tier transition. All three are static.
- A configurable threshold for how many reviewers fit before collapsing to `+N` in the panel — the panel is generous enough that all reviewers render in full.
- Showing CI status on TO DO / In Implementation cards. The MR section is still column-gated on the card; only the panel surfaces MR data regardless of column.
- A "GitLab CI degraded" header indicator. Silent degradation of the CI signal when GitLab is unreachable, identical to the existing GitLab-degraded behaviour.
- Reordering Done-column status groups (e.g. Done-first / STG-last). The order is hardcoded to match the verification-pipeline reading.
- Hyphenated / punctuated FIXASAP variants (`FIX-ASAP`, `FIX_ASAP`). The team uses one canonical label.
- A "FIXASAP filter" in the header search. The ribbon is a visual-only signal; filtering uses the existing search input.
- Multiple corner ribbons (e.g. a separate ribbon for blocked tickets). Only FIXASAP gets the treatment.
- Replacing the deemphasized opacity with a different visual treatment (greyscale, blur, smaller card). Opacity is the chosen treatment.
- Fetching `head_pipeline` for closed-not-merged MRs. Those are still treated as "no MR" per the parent PRD.
- Rendering the desync-warning row as part of the panel rail's MR block when the card itself does not show one. The card's column-gating logic is the source of truth for warning display.

## Further Notes

- The `ciVisualState` precedence ("conflict beats CI") matches the user's mental model that a conflict is the more actionable signal, regardless of pipeline state. This mirrors GitLab's own UI which surfaces conflict more prominently than pipeline status.
- The 180px rail constraint forced the multi-line stacked-block layout for reviewers. If future PRDs extend the panel block further (e.g. per-reviewer activity timestamps), widening the rail to 240px is a single grid-column change in `IssueDetailPanel`.
- The FIXASAP triangle and the green section tint are deliberately allowed to coexist: the triangle is about *ticket urgency*, the tint is about *MR readiness*. Together they signal "merge this now"; suppressing one in the presence of the other would lose information.
- The `summarizeMr` change is additive: the `ciState` field is only present on the `'review'` kind. Tests pinning the existing precedence-rule output (merged / draft / no-reviewers) remain valid without modification.
- Polishing here is intentionally cosmetic-and-glanceable. No new mutations, no new endpoints, no new env vars — the feature is small enough to land in a single PR.

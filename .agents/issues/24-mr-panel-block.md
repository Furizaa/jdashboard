# 24 — MR block in detail panel + Open MR button

**Type:** AFK

## Parent

[Misc improvements PRD](../prds/misc-improvements.md)

## What to build

A new MR block in the detail panel's right-side properties rail, plus an "Open MR" icon button in the panel header. The block mirrors the card's display states with reviewer state spelled out explicitly.

- New `src/features/mr-status/MrPanelBlock.tsx`:
  - Component takes `issueKey` (and reuses the existing `useMrStatus(issueKey)` hook from `use-mr-statuses.ts`).
  - Shown whenever a matching MR exists, regardless of column. When no matching MR exists, returns `null` — no placeholder, no empty header.
  - On `'review'`:
    - A small section header "Merge Request" with the `<MrCiIndicator>` rendered inline at the top-right.
    - A vertical list of reviewer blocks. Each block: 20px avatar + display name (truncated to fit the 180px rail) + a one-line state badge ("Approved", "Approved (unresolved)", "Requested changes", "Reviewed", "Pending"). The state badge text is derived from the existing `ReviewerVisualState` values (no new mapping table — extend the human-readable labels alongside the existing `ReviewerAvatar` tooltip strings).
    - The unresolved-count chip below the reviewer list (lucide `MessageSquare` + count), hidden when 0.
    - When `allApprovedAndClean`, the entire block takes on the same `bg-green-500/10` tint with a `border-l-2 border-green-500/40` left accent as the card's review row.
  - On `'merged'`, `'draft'`, `'no-reviewers'`: a compact warning row using the same icon and amber palette as `<MrWarning>` on the card, with a one-line message matching the card's text. The merged-warning click action is *not* duplicated here — the panel's primary surface is informational; the merged-transition action stays on the card.
  - Done-column desync (still-open MR on a Done-column ticket): a compact warning row with the same desync message as the card.
  - The `column` prop is *not* required — the panel block always renders when `summary !== null`. Card-level column gating does not apply here, per the PRD.
- Extend `src/features/ticket-detail/IssueDetailPanel.tsx`:
  - Replace the body of the `<aside>` properties rail to render the existing `Field` blocks (Status, Type, Priority, Assignee, Reporter, Labels) followed by `<MrPanelBlock issueKey={issue.key} />`. Keep the rail at its current 180px width.
  - Add an "Open MR" icon button to `PanelHeader`, placed immediately before the existing "Open in Jira" link. Use the same lucide `ExternalLink` icon and the same styling. Hidden (returns `null`) when no matching MR exists. Reads the MR `webUrl` from the same `useMrStatus(issue.key)` hook the panel block uses.
  - The "Open MR" button's `aria-label` is "Open MR" (mirrors "Open in Jira"). Clicking opens `webUrl` in a new tab with `noopener,noreferrer`.
- Extend `src/features/mr-status/index.ts` to export `MrPanelBlock`.
- No new tests — the panel block is a composition layer per the PRD's testing decisions. The `ciState` and `ReviewerVisualState` mappings it relies on are already covered by slices 17 and 23.
- Manual verification covers: a card with a `'review'` MR (full reviewer list visible in the rail), a card with a merged MR (warning visible in rail, "Open MR" button visible in header), a card with no matching MR (no rail block, no header button), and a Done-column card with an open MR (desync warning in rail).

## Acceptance criteria

- [ ] Opening a ticket with a matching MR renders an MR block in the panel's right-side rail, beneath the existing properties fields.
- [ ] The rail stays at its current 180px width.
- [ ] On a `'review'` MR, the block shows: a "Merge Request" header with the CI/conflict indicator inline; a stacked list of reviewers (avatar + display name + state badge text); the unresolved-count chip when count > 0.
- [ ] When `allApprovedAndClean`, the panel block has the green tint and left accent.
- [ ] On a merged / draft / no-reviewers MR, the block shows the corresponding amber warning row instead of the reviewer list.
- [ ] On a Done-column ticket whose MR is still open, the block shows the desync warning.
- [ ] When no matching MR exists, the panel rail block is absent — no placeholder, no header.
- [ ] The MR block renders regardless of column (TO DO, In Implementation, In Code Review, Done) when a matching MR exists.
- [ ] The panel header shows an "Open MR" icon button immediately before the existing "Open in Jira" link, when a matching MR exists.
- [ ] The "Open MR" button is hidden (not disabled) when no matching MR exists.
- [ ] Clicking "Open MR" opens the MR's `web_url` in a new tab.
- [ ] The CI/conflict indicator's visual vocabulary matches the card.
- [ ] Reviewer state is spelled out as text — no information that was on the card is hidden behind a hover tooltip in the panel.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

- [23 — MR CI/conflict indicator on Code Review row](./23-mr-ci-conflict-indicator.md)

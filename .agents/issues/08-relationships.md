# 08 — Parent, sub-issues, linked issues

**Type:** AFK

## Parent

[clashboard PRD](../prds/clashboard.md)

## What to build

Three sections in the detail panel showing the issue's relationships, with inline navigation to related tickets.

- **Parent section** (single row) if the issue has a parent (epic or other parent ticket).
- **Sub-issues section** if the issue has sub-issues, with an `n/m done` progress chip in the section header (where `m` is total, `n` is the count whose `statusCategory === 'done'`).
- **Linked issues section** if the issue has issue links, **grouped by link type** label (Blocks, Is blocked by, Relates to, Duplicates, etc.).
- **Compact row component** (shared across the three sections):
  - Type icon
  - Key
  - Title
  - Non-clickable display-only status pill
- **Click row** → panel content replaces with that issue (URL updates to `?issue=<NEW_KEY>`). Browser back returns to the previous panel content.
- **Out-of-scope tickets**: sub-issues / linked issues outside the board JQL filter still load and render. The `getIssue` server function does not apply the board filter.

## Acceptance criteria

- [ ] Parent section appears if the issue has a parent; row is the shared compact format.
- [ ] Sub-issues section appears if the issue has sub-issues, with `n/m done` progress chip.
- [ ] Linked issues section appears if the issue has links, grouped by link type label.
- [ ] Each row: type icon, key, title, non-clickable status pill.
- [ ] Clicking a row updates the URL to `?issue=<NEW_KEY>` and replaces panel content.
- [ ] Browser back returns to the previous panel content.
- [ ] Linked issues outside the board JQL still load and render correctly.
- [ ] Status pills on rows are display-only (clicking the pill does nothing distinct from clicking the row).
- [ ] No section renders if the issue has no items of that kind (no empty placeholders).

## Blocked by

- [05 — Detail panel (read-only, plain text)](./05-detail-panel.md)

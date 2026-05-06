# 14 — Keyboard shortcuts (panel)

**Type:** AFK

## Parent

[clashboard PRD](../prds/clashboard.md)

## What to build

Keyboard-only navigation and actions for the detail panel. (Esc and Cmd+K were already wired earlier; this slice ships the rest and ensures consistency.)

- **`J` / `↓`** — navigate to the next ticket in the current column when the panel is open.
- **`K` / `↑`** — navigate to the previous ticket in the current column when the panel is open.
- **`O`** — open the current ticket in Jira (new tab) when the panel is open.
- **`C`** — copy the current ticket's URL to clipboard with a confirmation toast when the panel is open.
- **All shortcuts disabled while a text input is focused** (search box, etc.).
- Shortcuts work consistently with the prev/next arrow buttons in the panel header (slice 05) — both paths produce the same navigation.

## Acceptance criteria

- [ ] `J` and `↓` navigate to the next ticket in the current column (panel open).
- [ ] `K` and `↑` navigate to the previous ticket in the current column (panel open).
- [ ] `O` opens the current ticket in Jira in a new tab (panel open).
- [ ] `C` copies the current ticket's URL to clipboard with a confirmation (panel open).
- [ ] None of the above fire while a text input is focused.
- [ ] Behavior at column ends matches the prev/next arrow buttons from slice 05 (wrap or stop — same as documented there).

## Blocked by

- [05 — Detail panel (read-only, plain text)](./05-detail-panel.md)

# 04 — Click-to-copy + open-in-Jira from card

**Type:** AFK

## Parent

[clashboard PRD](../prds/clashboard.md)

## What to build

Wire the two card-key affordances and the global toast container.

- **`sonner`** mounted at the root layout (`<Toaster />`). Configured for the dark theme.
- **Click on key** (plain click) → copy `${JIRA_BASE_URL}/browse/${key}` to clipboard. Brief confirmation: either an in-place "Copied" indicator on the key (preferred, less noise) or a sonner toast — pick one and document.
- **Cmd/Ctrl-click on key** → `window.open(...)` to open the Jira URL in a new tab. Does not copy.
- **Click anywhere else on the card** must NOT trigger copy or open (left for slice 05).
- Event propagation handled correctly so the copy/open does not also trigger card-body handlers from later slices.

## Acceptance criteria

- [ ] Plain click on a card's key copies the Jira URL to clipboard.
- [ ] Confirmation visible (in-place "Copied" or sonner toast) on copy.
- [ ] Cmd/Ctrl-click on key opens the Jira URL in a new tab.
- [ ] Cmd/Ctrl-click does not copy to clipboard.
- [ ] Click elsewhere on the card body does not trigger copy or open behavior.
- [ ] sonner `<Toaster />` mounted at the app root and styled for dark theme.

## Blocked by

- [03 — Card visual polish](./03-card-polish.md)

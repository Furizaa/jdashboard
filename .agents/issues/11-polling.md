# 11 — Polling + sync indicator + manual refresh

**Type:** AFK

## Parent

[clashboard PRD](../prds/clashboard.md)

## What to build

Visibility-aware polling for the board and the open issue, with a sync indicator and manual refresh in the header.

- **`usePolling` hook** in `lib/`: visibility-aware interval. Wraps a refetch callback and:
  - Fires every `interval` ms while `document.visibilityState === 'visible'`.
  - Pauses while `document.hidden`.
  - On `visibilitychange` to visible, immediately refetches and resumes the interval.
  - Cleans up on unmount.
- **Board polls every 60s** (visibility-aware) using the hook on top of `useBoardIssues`.
- **Detail panel polls the open issue every 60s** (visibility-aware) when the panel is open.
- **`Synced Ns ago` indicator** in the header. Updates every ~5s. Uses `date-fns` `formatDistanceToNow` or equivalent. Clicking it triggers a refresh.
- **Manual refresh button** (icon button) next to the indicator. Refetches the board list and invalidates all individual issue caches (so the next time a panel opens, fresh data loads).
- **Sync-failed state** — if a poll request errors, the indicator switches to red `Sync failed · Retry` with the underlying error in a tooltip. The board keeps showing the last good data.
- Tests for `usePolling`: pauses on hidden, refetches on focus, cleans up on unmount, fires on the configured interval. Use Vitest fake timers and a mocked `visibilityState`.

## Acceptance criteria

- [ ] Board refetches every 60s when the tab is visible.
- [ ] Polling pauses when `document.visibilityState === 'hidden'`.
- [ ] On focus (visibility back to visible), the board immediately refetches and the interval resumes.
- [ ] When the detail panel is open, the displayed issue also refetches every 60s.
- [ ] "Synced Ns ago" indicator visible in the header, updating every ~5s.
- [ ] Clicking the indicator triggers a refresh (same effect as the manual refresh button).
- [ ] Manual refresh button refetches the board list and invalidates per-issue caches.
- [ ] On poll error, the indicator switches to red "Sync failed · Retry" with the error in a tooltip; last good data remains visible.
- [ ] `usePolling` unit-tested with fake timers + mocked `visibilityState`.

## Blocked by

- [02 — Read-only board with status mapping](./02-board-statuses.md)

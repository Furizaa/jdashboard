# 10 — Status change mutation

**Type:** AFK

## Parent

[clashboard PRD](../prds/clashboard.md)

## What to build

The only mutation in the app: changing a ticket's status via a dropdown on the status pill.

- **`getTransitions(key)` server function** — calls `/rest/api/3/issue/{key}/transitions`, returns the list of valid transitions from the current status.
- **`transitionIssue(key, transitionId)` server function** — POSTs the chosen transition.
- **`useTransitions(key)` query hook** — fetches transitions for a ticket. Lazy: enabled only when the dropdown is opened (not on card mount, to avoid flooding Jira with requests on board load).
- **`useTransitionMutation()` mutation hook** — implements the optimistic-update pattern via TanStack Query's `onMutate` (snapshot + apply optimistic patch), `onError` (rollback + sonner toast with Jira's error message), `onSuccess` (invalidate just that one issue's query, not the board list).
- **Status pill becomes interactive**: clicking it opens a dropdown listing valid transitions (loading state while transitions are fetching).
- **Properties rail status pill** in the detail panel uses the same dropdown component.
- **Transition resolver** pure module in `features/status-pill/`: `(currentStatus, targetColumn, allowedTransitions) → Transition | null`. Encapsulates the cascade rule (from `Reviewed`, dragging to "Done" tries `In STG` first, etc.). Used wherever a column-level intent needs to be resolved to a specific transition. Drag is descoped, but the resolver is still useful for any future flow that targets a column rather than a status — and shipping it now keeps the domain logic complete.
- **No keyboard shortcut** for status changes (avoid accidental moves).
- Tests for the transition resolver covering: every starting status × every column × representative allowed-transition lists; "no valid path" returns `null`; current-status-already-in-target-column case.

## Acceptance criteria

- [ ] Clicking a card's status pill opens a dropdown.
- [ ] Dropdown lazy-fetches transitions on open and shows a brief loading state.
- [ ] Dropdown lists only transitions that Jira reports as valid from the current status.
- [ ] Selecting a transition updates the card immediately (optimistic).
- [ ] On Jira success, just that issue's query is invalidated (board list is not refetched).
- [ ] On Jira error, the card rolls back to its prior status and a sonner toast surfaces Jira's error message.
- [ ] The same dropdown is wired on the properties rail in the detail panel.
- [ ] Transition resolver module unit-tested across the table of cases described above.
- [ ] No keyboard shortcut triggers a status change.

## Blocked by

- [03 — Card visual polish](./03-card-polish.md)

# Watchlist

Lets me curate Jira tickets I advise on as a technical consultant but am **not assigned to** — so they never appear in the board's own JQL. A header button opens a search modal to add one; confirmed tickets are pinned to a **sub-section of the In Implementation lane** (epic-purple tint) until removed from the ticket's detail flyout. The curated key list persists in a server-side JSON file (`~/.clashboard/watchlist.json`); the server hydrates keys into cards via `key IN (...)`.

This context is a hybrid of the existing patterns: it contributes board cards like **Review** (server builds cards, Board's `assembleColumns` injects them), it owns a top-level search modal like **Capture**, and its detail-panel remove action is reached through the coordinator like the **Workspace** controls.

## Language

**Watchlist card** (kernel `BoardIssue`): a Jira issue on the watchlist, rendered exactly like a board card but always placed in the In Implementation `section: 'watchlist'` group with a purple tint and `Eye` badge. Its status pill is display-only (advisory — no transitions).

**Candidate** (`WatchlistCandidate`): a lightweight `{ key, summary, statusName, typeName }` search-result row shown in the add-modal. Deliberately smaller than a card.

**Membership**: whether a ticket key is on the watchlist — derived client-side from the `['watchlist']` cards query (`useWatchlistMembership`), driving the detail panel's remove button. Mirrors `useWorkspaceOpen`.

_Avoid_: "pin" (reserved for capture's hardcoded parents); calling the sub-section a "column" (it is a group inside the In Implementation column).

## Use-cases (application service surface)

`WatchlistApplicationService` (tested exemplar; presenters call the server functions directly, as in Review):

| Method         | Returns                                  | Notes                              |
| -------------- | ---------------------------------------- | ---------------------------------- |
| `loadCards()`  | `ResultAsync<WatchlistCardsSnapshot, …>` | Wraps `getWatchlistCards`.         |
| `search(text)` | `ResultAsync<CandidatesSnapshot, …>`     | Wraps `searchWatchlistCandidates`. |

`WatchlistLoadError` is two hand-rolled tagged classes (`WatchlistUnauthorized | WatchlistNetworkError`) per ADR 0004.

Add/remove are mutations reached via server functions directly from the presenters (`useWatchlistModal.add`, `useRemoveFromWatchlist`), each invalidating the `['watchlist']` query — the same pattern as the Workspace focus/discard controls.

## View-model state machine

`watchlist-modal-view-model` guards the add-modal's open lifecycle: `closed | open-idle | open-adding | open-error`. Closing is blocked while `open-adding` (like quick-create). Search results are transient query data held by the presenter, not modelled here.

## Cross-context dependencies

- `~/kernel` — `BoardIssue`, `WatchlistCandidate`, `GetWatchlistCardsResult`, `SearchWatchlistCandidatesResult`, `WatchlistMutationResult`, `watchlistCardId`.
- `~/coordinator/hooks` — `useBoardData` (gate cards query on first board paint), `~/coordinator/adapters/tanstack-cache` — query keys (presenter only).
- `~/server/server-functions/watchlist` — the four server functions (presenter only).

No imports from `~/contexts/<other>`. Board consumes `useWatchlistCards` and Detail consumes `useWatchlistMembership` / `useRemoveFromWatchlist` through the coordinator re-export, never directly.

## Public surface

```ts
export { WatchlistButton } from './view/WatchlistButton'
export {
  useInvalidateWatchlist,
  useRemoveFromWatchlist,
  useWatchlistCards,
  useWatchlistMembership,
} from './presenter'
```

`WatchlistButton` is wired into the route header; the hooks are re-exported by `~/coordinator` for Board and Detail. Internal types (`WatchlistApplicationService`, `WatchlistModalApi`, …) are not part of the public surface.

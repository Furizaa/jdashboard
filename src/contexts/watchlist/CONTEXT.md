# Watchlist

Lets me curate Jira tickets I advise on as a technical consultant but am **not assigned to** — so they never appear in the board's own JQL. A header button opens a search modal to add one; confirmed tickets are pinned to a **sub-section of the In Implementation lane** (epic-purple tint) until removed from the ticket's detail flyout. The curated key list persists in a server-side JSON file (`~/.clashboard/watchlist.json`); the server hydrates keys into cards via `key IN (...)`.

This context is a hybrid of the existing patterns: it contributes board cards like **Review** (server builds cards, Board's `assembleColumns` injects them), it owns a top-level search modal like **Capture**, and its detail-panel remove action is reached through the coordinator like the **Workspace** controls.

It also owns a **dedicated board surface** — the **Watchlist Board**, reached from the left nav rail (`routes/-nav`). The watchlist sub-section on the main board is unchanged; this is an additional view that scales when the sub-section overflows. On the Watchlist Board the same watchlist cards are laid out in **tag-filtered swimlanes**: the user maps tags to ordered lanes, and **each lane holds one or more tags** (lane 1 → tags A+B, lane 2 → tag C, …). A card lands in a lane when it carries **any** of that lane's tags (union), and renders in _every_ lane it matches; cards with no matching tag are hidden. Each lane is collapsible like the main board's Done column, and collapsed lanes stack to the right as thin rails. This board has no change-indication animation (a deliberate simplification — a pure `derive`, no reducer).

## Watchlist Board layers

| Layer          | File(s)                                                       | Role                                                                                 |
| -------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Domain**     | `domain/assemble-lanes.ts`                                    | Pure: cards × tags-state × lane-config × search → ordered `WatchlistLane[]`.         |
| **View-model** | `view-model/watchlist-board-view-model.ts`                    | `derive` → loading / error-hard / unauthorized / no-lanes / ready. No reducer.       |
| **Presenter**  | `presenter/use-watchlist-board.ts`                            | Wires cards + tags (coordinator) + lane config into `derive`; polls the cards query. |
|                | `presenter/use-watchlist-lanes.ts`                            | `['watchlist-lanes']` query + set mutation (persisted config).                       |
|                | `presenter/use-collapsed-lanes.ts`                            | Per-viewer collapsed-lane set in localStorage (mirrors board's `useCollapsedDone`).  |
| **View**       | `view/WatchlistBoard.tsx` + `WatchlistLane` + `CollapsedLane` | Lanes surface; expanded on the left, collapsed rails stacked to the right.           |
|                | `view/LaneConfigButton.tsx` + `LaneConfigModal.tsx`           | Header control to map tags → ordered lanes.                                          |

**Lane** (`WatchlistLane`): one swimlane, bound to one or more tags, holding the watchlist cards carrying any of them. **Lane configuration** (`WatchlistLaneConfig` = `{ id, tagIds }`): an ordered `lanes` list persisted server-side at `~/.clashboard/watchlist-lanes.json` (via `~/server/lib/watchlist-lanes-store.ts`), the same local-JSON convention as tags/watchlist/notes. Each lane's `id` is a stable client-generated token (so its collapsed state survives edits to its tag set). Tagless lanes are dropped on write; deleted tags are pruned client-side against the live definitions, and a lane left with no live tags is skipped. The store migrates the earlier single-tag `{ laneTagIds }` shape on read.

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

- `~/kernel` — `BoardIssue`, `WatchlistCandidate`, `GetWatchlistCardsResult`, `SearchWatchlistCandidatesResult`, `WatchlistMutationResult`, `watchlistCardId`, plus the lane types (`GetWatchlistLanesResult`, `SetWatchlistLanesResult`, `WatchlistLanesState`), `TagsState` / `TagDefinition`, `resolveTagColor`.
- `~/coordinator` — `useBoardData` (gate cards query on first board paint), `useTagsState` / `useTagDefinitions` (the board's lanes are tag-driven); `~/coordinator/adapters/tanstack-cache` — query keys (presenter only).
- `~/server/server-functions/{watchlist, watchlist-lanes}` — the server functions (presenter only).
- `~/widgets/ticket-card`, `~/design-system` — the Watchlist Board's view renders cards and its config modal (view only).

No imports from `~/contexts/<other>`. Board consumes `useWatchlistCards` and Detail consumes `useWatchlistMembership` / `useRemoveFromWatchlist` through the coordinator re-export, never directly. Tags reach the Watchlist Board only through the coordinator re-export (`useTagsState`), never by importing `~/contexts/tags`.

## Public surface

```ts
export { WatchlistButton } from './view/WatchlistButton'
export { WatchlistBoard } from './view/WatchlistBoard'
export { LaneConfigButton } from './view/LaneConfigButton'
export {
  useInvalidateWatchlist,
  useRemoveFromWatchlist,
  useWatchlistCards,
  useWatchlistMembership,
} from './presenter'
```

`WatchlistButton` and `LaneConfigButton` are wired into the route header; `WatchlistBoard` is mounted by the `/watchlist` route via the shared `AppShell`. The watchlist hooks are re-exported by `~/coordinator` for Board and Detail. Internal types (`WatchlistApplicationService`, `WatchlistModalApi`, `WatchlistBoardDisplay`, …) and the board-only presenter hooks are not part of the public surface.

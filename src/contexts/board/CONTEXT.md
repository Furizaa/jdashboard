# Board

Renders my work as four columns (TO DO, In Implementation, In Code Review, Done). Composes Jira issues with GitLab review-card stand-ins on the same grid; tracks transient animation state (entering / changed / leaving) across polls.

## Language

**BoardView**:
The projection of live Jira issues + review cards onto the four-column grid. Owned by this context; consumed by the route through the public `Board` component.

**Column**:
One of the four canonical placements: `TO DO`, `In Implementation`, `In Code Review`, `Done`. Kernel type — shared with Detail (sibling navigation), Review (review-card placement), and the status pill widget.

**ColumnItem**:
A renderable card on the board: a Jira issue or a review card, with an animation state and a stable id (`<jira-key>` or `review:<iid>`).

**ChangeVisual**:
The view-model's stored animation state for one track (jira or review): which keys are currently entering, changed, or leaving. Distinct from `ChangeDiff`, which is the per-tick diff input.

**ChangeDiff**:
The pure-domain output of `diffChange(prev, current, options, leaving)` — the entering / changed / leavingNow / returning sets for one tick. Fed into the view-model as a `*DiffApplied` event.

**Snapshot**:
The board data the application service exposes on success — `{ baseUrl, issues }`. Stripped of the `{ ok, reason }` envelope so the consumer sees a clean Result.

_Avoid_: "BoardState" (overloaded with the view-model's internal `State`), "phase" by itself for the display-state union (it's a _field_; the union is `DisplayState`).

## Use-cases (application service surface)

The `BoardApplicationService` exposes only what Board needs:

| Method        | Returns                                      | Notes                                                                            |
| ------------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| `loadBoard()` | `ResultAsync<BoardSnapshot, BoardLoadError>` | Wraps the gateway. `BoardLoadError` is `BoardUnauthorized \| BoardNetworkError`. |
| `refresh()`   | `void`                                       | Invalidates the board cache via the cache port.                                  |

`BoardLoadError` is two hand-rolled tagged classes (`_tag: 'BoardUnauthorized' \| 'BoardNetworkError'`) per ADR 0004; the presenter unwraps via `result.match` or ts-pattern.

## View-model state machine

`State` holds two `ChangeVisual<T>` accumulators (jira track + review track). Events:

- `jiraDiffApplied` / `reviewDiffApplied` — fold a `ChangeDiff` into the matching visual: union into `enteringKeys` and `changedKeys`, add `leavingNow` and remove `returning` from `leaving`.
- `jiraEnteringExpired` / `jiraChangedExpired` / `jiraLeavingExpired` (and review variants) — remove the named keys from the matching set/map after the timer fires.

`reduce(state, event)` is exhaustive over the event union (ts-pattern `.exhaustive()`). It returns the same state reference for empty diffs / empty key lists, so React effects don't loop.

`derive(state, queryData, reviewCards, searchQuery, retry)` is the projection to `DisplayState`:

```
loading  ← queryData.isPending
error-hard ← queryData.isError ∧ data === undefined
unauthorized ← data === undefined ∨ data.ok === false
empty ← data.ok === true ∧ issues.length === 0
ready ← data.ok === true ∧ issues.length > 0
```

`ready` carries `itemsByColumn` (from `assembleColumns`), `baseUrl`, `showErrorBanner` (true when isError but data still exists), `errorMessage`, and `retry`.

## Cross-context dependencies

- `~/kernel` — `Column`, `COLUMNS`, `columnForStatus`, `statusesForColumn`, `isDeemphasized`, status normalisation; re-exported server DTO types (`BoardIssue`, `SearchIssuesResult`, `ReviewCard`, ...).
- `~/coordinator` — `useBoardData`, `useMrStatuses`, `useReviewCards` (presenter only).
- `~/lib/use-polling` — visibility-aware refetch interval (presenter only).
- `~/widgets/ticket-card` — `TicketCard`, `buildCardView` (view layer only).

No imports from `~/contexts/<other>`; cross-context coordination would go through the coordinator.

## Public surface

`src/contexts/board/index.ts` exports only the route-facing surface:

```ts
export { Board } from './view'
```

Internal types (`BoardApplicationService`, `DisplayState`, `Event`, …) are not part of the public surface and are not re-exported.

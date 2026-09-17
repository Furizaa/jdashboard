# Bulk Refine

Owns the board-level Bulk Refine modal: paste one meeting transcript and refine the private note of every board or watchlist ticket the meeting discussed. A two-stage wizard — **route** the transcript to tickets (stage 1, a headless agent), then **apply** a per-ticket refine to the picked tickets (stage 2, the existing single-note Refine, fanned out with per-ticket progress). This context owns the wizard's lifecycle; it performs no note writes of its own — stage 2 is the Detail/server Refine path reused verbatim.

## Language

**Refine target** (`domain/targets`):
A ticket that may be routed to — `{ key, summary }`. The set is every board issue plus every watchlist card, de-duplicated by key (board copy wins). The `summary` is what lets the agent match a topic to a key. Structurally a server `RouteTicket`.

**Routed match** (kernel `RouteMatch`, joined with a summary):
Stage 1's output for one discussed ticket — `{ key, brief }` from the agent, joined by the presenter with the target's `summary`. The **brief** is the meeting distilled to just what concerns that one ticket, written as the REFINE input stage 2 folds into its note.

**Selectable match** / **Apply item**:
View-model rows. A `SelectableMatch` (`{ key, summary, brief, selected }`) is a routed match with a checkbox in the preview step. An `ApplyItem` (`{ key, summary, status, error? }`) tracks one ticket's stage-2 progress — `pending | refining | done | failed`.

**BulkRefine state** / **event**:
The view-model's discriminated union — `closed | input | routing | preview | no-matches | applying | done | route-error` — and its events. The reducer is exhaustive over event × state via ts-pattern.

_Avoid_: writing notes in this context (stage 2 is `useRefineNote`, whose own `onSuccess` invalidates note/changelog/note-keys); "isBusy" as a stored field (it's the selector `phase === 'routing' || phase === 'applying'`).

## Use-cases

There is no context-local application service; both stages are coordinator hooks, and neither Jira nor GitLab is reached from here.

| Stage     | Coordinator hook     | Server function                      | Notes                                                                                           |
| --------- | -------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1 — route | `useRouteTranscript` | `routeTranscript` (`bulk-refine.ts`) | Pure read. Returns `{ matches: { key, brief }[] }`. Writes nothing; no cache invalidation.      |
| 2 — apply | `useRefineNote`      | `refineNote` (`refine.ts`)           | Reused unchanged, one call per picked ticket. Its `onSuccess` invalidates that ticket's caches. |

Both server functions shell out to the local `claude` CLI via the shared async runner in `~/server/lib/claude-cli` (`spawnClaude`, non-blocking), so the pool of stage-2 refines genuinely overlaps. Failures surface as tagged `{ ok: false }` results, shown in the modal (route errors in the input step, per-ticket errors on the progress row) — no toasts.

## View-model state machine

`State` is `closed | input | routing | preview | no-matches | applying | done | route-error`; `reduce(state, event)` is exhaustive over the event union (ts-pattern `.exhaustive()`), each arm exhaustive or otherwise-anchored over the phase.

Transition table (`—` = state returned unchanged):

| from / event    | opened | closed      | setTranscript | routeStarted | routed               | routeFailed | toggled | applyStarted | ticketStarted/Finished | applyFinished |
| --------------- | ------ | ----------- | ------------- | ------------ | -------------------- | ----------- | ------- | ------------ | ---------------------- | ------------- |
| **closed**      | input  | —           | —             | —            | —                    | —           | —       | —            | —                      | —             |
| **input**       | —      | closed      | input         | routing      | —                    | —           | —       | —            | —                      | —             |
| **routing**     | —      | — (blocked) | —             | —            | preview / no-matches | route-error | —       | —            | —                      | —             |
| **preview**     | —      | closed      | —             | —            | —                    | —           | preview | applying     | —                      | —             |
| **no-matches**  | —      | closed      | —             | —            | —                    | —           | —       | —            | —                      | —             |
| **applying**    | —      | — (blocked) | —             | —            | —                    | —           | —       | —            | applying               | done          |
| **route-error** | —      | closed      | route-error   | routing      | —                    | —           | —       | —            | —                      | —             |

`routed` lands on `preview` when there are matches (all selected by default) or `no-matches` when empty. Close is blocked while `routing` or `applying` — an agent run or note writes are in flight; every settled step is closable and resets to `closed`. `deriveBulkRefine(state)` projects each phase to the display the view renders; `isBusy(state)` returns `phase === 'routing' || phase === 'applying'`.

## Cross-context dependencies

- `~/kernel` — `BoardIssue` (target merge), `RouteTranscriptResult`, `RouteMatch`, `RefineNoteResult`.
- `~/coordinator` — `useBoardData`, `useWatchlistCards`, `useRouteTranscript`, `useRefineNote` (presenter only). The board + watchlist reads share the Board's cached queries.
- `~/design-system` — `Dialog` family (view only).
- `~/lib` — `cn`, `testIds` (view only).

No imports from `~/contexts/<other>`. The watchlist and board data arrive through `~/coordinator`, not by reaching into those contexts.

## Public surface

```ts
export { BulkRefineButton } from './view'
```

`BulkRefineButton` is the Header trigger that mounts the modal (mirrors `QuickCreateButton`). Internal types (`BulkRefineApi`, `State`, `Event`, `RefineTarget`, …) are not re-exported.

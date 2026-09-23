# Bulk Refine

Owns the board-level Bulk Refine modal: paste one meeting transcript and refine the private note of every board or watchlist ticket the meeting discussed. A two-stage wizard — **route** the transcript to tickets (stage 1, a headless agent), then **apply** a per-ticket refine to the picked tickets (stage 2, the existing single-note Refine, fanned out with per-ticket progress). This context owns the wizard's lifecycle; it performs no note writes of its own — stage 2 is the Detail/server Refine path reused verbatim.

Stage 2 is **batched by ticket** because refine can now grill (ask clarifying questions when a transcript is ambiguous — see `refine-ticket-notes/SKILL.md` and kernel `refine-grilling`). A first **gathering** pass refines every clear ticket outright and collects questions from the ambiguous ones; those questions are then reviewed together, grouped by ticket (the shared `~/widgets/refine-questions` tool), and an **applying** pass finishes them with the answers folded in. A rare dependent follow-up loops back for another short round.

## Language

**Refine target** (`domain/targets`):
A ticket that may be routed to — `{ key, summary }`. The set is every board issue plus every watchlist card, de-duplicated by key (board copy wins). The `summary` is what lets the agent match a topic to a key. Structurally a server `RouteTicket`.

**Routed match** (kernel `RouteMatch`, joined with a summary):
Stage 1's output for one discussed ticket — `{ key, brief }` from the agent, joined by the presenter with the target's `summary`. The **brief** is the meeting distilled to just what concerns that one ticket, written as the REFINE input stage 2 folds into its note.

**Selectable match** / **Apply item** / **Ticket grill**:
View-model rows. A `SelectableMatch` (`{ key, summary, brief, selected }`) is a routed match with a checkbox in the preview step. An `ApplyItem` (`{ key, summary, status, error? }`) tracks one ticket's stage-2 progress — `pending | refining | awaiting | done | failed` (`awaiting` = the agent asked questions and is waiting for the user). A `TicketGrill` (`{ key, summary, brief, questions, answers, priorAnswers }`) holds one grilled ticket's questions, the user's in-progress answer draft, and the clarifications settled in earlier rounds; the `grills` map is keyed by ticket key.

**BulkRefine state** / **event**:
The view-model's discriminated union — `closed | input | routing | preview | no-matches | gathering | questions | applying | done | route-error` — and its events. The reducer is exhaustive over event × state via ts-pattern.

_Avoid_: writing notes in this context (stage 2 is `useRefineNote`, whose own `onSuccess` invalidates note/changelog/note-keys only on a completed note); "isBusy" as a stored field (it's the selector `phase === 'routing' || 'gathering' || 'applying'`); resolving answers here (the presenter uses kernel `resolveRefineAnswers`, unanswered → recommended).

## Use-cases

There is no context-local application service; both stages are coordinator hooks, and neither Jira nor GitLab is reached from here.

| Stage     | Coordinator hook     | Server function                      | Notes                                                                                                                                                               |
| --------- | -------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — route | `useRouteTranscript` | `routeTranscript` (`bulk-refine.ts`) | Pure read. Returns `{ matches: { key, brief }[] }`. Writes nothing; no cache invalidation. Not grilled.                                                             |
| 2 — apply | `useRefineNote`      | `refineNote` (`refine.ts`)           | Reused unchanged, one call per picked ticket per pass. Returns a note _or_ questions; only a note writes + invalidates. `priorAnswers`/`round` carry across rounds. |

Both server functions shell out to the local `claude` CLI via the shared async runner in `~/server/lib/claude-cli` (`spawnClaude`, non-blocking), so the pool of stage-2 refines genuinely overlaps. Failures surface as tagged `{ ok: false }` results, shown in the modal (route errors in the input step, per-ticket errors on the progress row) — no toasts.

## View-model state machine

`State` is `closed | input | routing | preview | no-matches | gathering | questions | applying | done | route-error`; `reduce(state, event)` is exhaustive over the event union (ts-pattern `.exhaustive()`), each arm exhaustive or otherwise-anchored over the phase.

Stage 1 is unchanged (`input → routing → preview / no-matches / route-error`). Stage 2 is the batched-by-ticket loop:

- **preview → gathering** (`gatherStarted`): the first refine pass over the picked tickets, `priorAnswers: []`, `round: 1`.
- Per-ticket outcomes update `items`: `ticketStarted` → `refining`; then `ticketNoted` → `done` (note written), `ticketAsked` → `awaiting` (+ a `grills[key]` entry), or `ticketFailed` → `failed`.
- **gathering → questions | done** (`passSettled`): to `questions` if any item is `awaiting`, else straight to `done` (the clear-transcript case — same one-shot feel as before).
- **questions**: `answersChanged` edits one ticket's draft; **`applyStarted`** folds each awaiting ticket's resolved answers into its `priorAnswers`, marks those items `refining`, and moves to `applying` (`round + 1`). The presenter resolves answers with kernel `resolveRefineAnswers` first.
- **applying → questions | done** (`passSettled`): another round of questions if any ticket asked again, else `done`.

Per-ticket events (`ticketStarted/Noted/Asked/Failed`) apply only during `gathering`/`applying` (helper `onPass`); they are ignored elsewhere. `routed` lands on `preview` (matches, all selected) or `no-matches` (empty). Close is blocked while `routing`, `gathering`, or `applying` (`isBusy`); every settled step — including the `questions` review — is closable and resets to `closed`. `deriveBulkRefine(state)` projects each phase; the `questions` display lists only the still-`awaiting` tickets (joined with their `grills` entry) plus a `settledCount` of the already-refined.

## Cross-context dependencies

- `~/kernel` — `BoardIssue` (target merge), `RouteTranscriptResult`, `RouteMatch`, `RefineNoteResult`, `RefineQuestion` / `RefineAnswer` / `RefineClarification`, `resolveRefineAnswers` (presenter).
- `~/coordinator` — `useBoardData`, `useWatchlistCards`, `useRouteTranscript`, `useRefineNote` (presenter only). The board + watchlist reads share the Board's cached queries.
- `~/widgets/refine-questions` — `RefineQuestions`, the shared interactive question tool (view only; also used by single-note Refine).
- `~/design-system` — `Dialog` family (view only).
- `~/lib` — `cn`, `testIds` (view only).

No imports from `~/contexts/<other>`. The watchlist and board data arrive through `~/coordinator`, not by reaching into those contexts.

## Public surface

```ts
export { BulkRefineButton } from './view'
```

`BulkRefineButton` is the Header trigger that mounts the modal (mirrors `QuickCreateButton`). Internal types (`BulkRefineApi`, `State`, `Event`, `RefineTarget`, …) are not re-exported.

# Explain

Owns the `/explain` surface: an **architect-altitude review of one merge request**, produced by a headless read-only Claude agent working in a throwaway detached worktree of the MR's head commit, streamed live into a tab, and rendered from a typed block report.

It is deliberately **not a diff viewer**. A diff answers "what changed on line 44"; this context's whole reason to exist is the four questions a diff structurally cannot answer — which systems does this touch, how does it change their contracts, what is the blast radius if it is wrong, and does the shape fit. The decisions are recorded in [ADR-0009](../../../docs/adr/0009-explain-surface-and-long-running-agent-runs.md); it replaced **Review MR**, which spawned a cmux workspace running `lumen diff --mr N`.

Explain is also the app's first **long-running background job**: start / read / close are ordinary JSON-RPC, and progress is server-sent events, because the thing that makes a ten-minute wait tolerable is watching it work.

## Language

**Explain tab** (kernel `ExplainTab`):
One merge request under review. Identity is the **MR iid, not the issue key** — the merge request is the reviewable unit, a ticket accumulates more than one MR over its life, and review cards arrive as MRs in the first place. `/explain` lists; `/explain?mr=123` selects. The open tab set is derived from `~/.clashboard/explain/`, never from client state, so a ten-minute run survives a reload.

**Phase** (kernel `ExplainPhase`):
`preparing | running | report | failed | interrupted`. `preparing` is the git checkout; `running` is the agent; `report` is a verdict in hand. `interrupted` means the run stopped without one — aborted, superseded by a re-run, or (the case the persisted-pending-record exists for) the dev server restarted under it. The tab then reads "interrupted — re-run".

**Live run** (`view-model` `LiveRun`):
What the SSE stream has said about one run, overlaying the server's snapshot. Two inputs can disagree about a tab and resolving that is the interesting part: the **snapshot** is the open set and the only source of `generatedAt`, the persisted report, and the MR's current head; the **stream** is the present tense and wins on phase, activity, and its own run's report. Guarded by `runId`, so a late message from a superseded run is ignored rather than applied to its successor.

**Activity line** (kernel `ExplainActivityLine`):
One coarse line of what the agent is doing — `read src/pricing/quote.ts`, `$ git log -- src/pricing`, a `thought`. Translated **server-side, once** (`explain-agent.ts`'s `activityFor`); raw `stream-json` never reaches the browser, so a CLI output-format change breaks one module. De-duplicated by `seq`, because the SSE endpoint replays the log before it subscribes.

**Block** (kernel `ExplainBlock`):
The report is `{ version: 1, blocks: Block[] }` — a discriminated union of `verdict`, `systems`, `narrative`, `diagram`, `finding`, `blast-radius`, `questions`, `unverified`. Validated by Zod at the server boundary, once; matched in the view by `renderBlock` with `ts-pattern.exhaustive()`, so **adding a block type is a compile error until it has a renderer**.

**Altitude** (`domain/block-altitude`):
The schema enforces it by what it cannot express — no `nit` severity, and a `finding` cannot exist without the `system` it concerns and a `whyItMatters`. What is left for the domain is reading order: worst severity first regardless of what the agent wrote, findings about one system kept together, and **everything else left where the agent put it** (`layOutReport` replaces the findings in place, so a narrative that introduces them stays above them).

**Viewport** (`domain/diagram-viewport`):
A diagram's `scale` and offset, and the three moves that change them — `zoomAbout`, `panBy`, `wheelZoomFactor`. Inline, a diagram is a **thumbnail**: mermaid scales it to the report column, which for anything structural enough to be worth drawing is too small to read, so the block is a button into `DiagramOverlay` — the same SVG, window-sized, dragged and zoomed. The invariant the arithmetic exists for is that the content under the cursor does not move when you zoom at it.

**Freshness** (`domain/stale-commits`):
`current | moved-on | unknown`. A report is pinned to the commit it describes, so the MR can move on underneath it; `unknown` is honest ignorance (GitLab unreachable) rather than "fine". The warning names the new head rather than counting commits — a count would need a compare call GitLab was not asked for.

_Avoid_: "review" as a noun for the tab (it is an _explain run_ — Review MR is the thing this replaced); treating `interrupted` as an error (nothing was lost but the run); re-sorting a whole report in the view; the word "diff" for what this produces.

## Use-cases

There is **no context-local application service**. As in `bulk-refine`, both halves are coordinator hooks over server functions, and neither Jira nor GitLab is reached from here.

| What           | Coordinator hook   | Server function                             | Notes                                                                                                                                                                               |
| -------------- | ------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the open set   | `useExplainRuns`   | `listExplainRuns` (`explain.ts`)            | Every persisted record, joined with any live run, plus each MR's current head for the stale warning. One query for the whole strip.                                                 |
| start / re-run | `useStartExplain`  | `startExplain`                              | Resolves the MR (head SHA, target branch, description, threads) and the ticket, then starts a run. One call for both: a start for an MR that has a tab supersedes it.               |
| close          | `useCloseExplain`  | `closeExplain`                              | Deletes the report, aborts a run in flight, and removes the worktree — all three, server-side.                                                                                      |
| watch a run    | `useExplainStream` | `GET /api/explain/:runId/stream` (ADR-0006) | SSE. `EventSource`, closed by this side on the terminal message so it never reconnects to a finished run. A `404` (a run the server has forgotten) closes once and reports it lost. |

The run itself lives server-side in `server/lib/explain-runs.ts` — a process-scoped registry, deliberately **not** an Effect service (local process state, injected deps, unit-testable with a fake runner and clock). The agent runs read-only by construction: `--permission-mode dontAsk`, `--strict-mcp-config`, an explicit read-only allowlist, a deny list naming every write-shaped tool, and a `cwd` scoped to a worktree clashboard throws away. **Nothing is written by the agent at all** — the report comes back on stdout and clashboard persists it.

## View-model state machine

`ExplainState` is `{ tabs, loaded, selected, live, closing, starting, startErrors }`; `reduce(state, event)` is exhaustive over the event union (`ts-pattern.exhaustive()`), and each arm that depends on phase is exhaustive over phase.

- **`tabsLoaded`** takes the server snapshot as the open set, keeps an overlay whose `runId` the server still agrees with, and drops the rest — a stale overlay must not outlive the thing it described. `loaded` exists because "no tabs" and "not loaded yet" are different panes.
- **`selected`** mirrors `?mr=`. **`runRequested`** is the click rather than its answer: a start spends a second or two reading the MR and the ticket before a run — and therefore a tab — exists, and `starting` is what lets the pane say so instead of showing "no reviews open" on a hand-off or the superseded report on a re-run. **`runStarted`** appends the tab and selects it _before_ any refetch, or a ten-minute run would start invisibly. **`startFailed`** records a start that never produced a run, so there is no stream to carry its message.
- **`streamEvent`** folds one SSE message into the overlay, ignoring any message whose `runId` the tab has replaced. **`streamLost`** reads a drop _during_ a run as `interrupted` and a drop after one as nothing new.
- **`closeRequested` / `closeDismissed` / `closed`**: closing selects the **neighbour** rather than dropping the reader onto the empty surface with other reviews still open. The presenter skips the confirmation entirely when `closeCostsARun` is false (a failed or interrupted tab costs nothing to reopen).

`deriveExplain(state)` projects the tab strip, one pane (`loading | no-tabs | none-selected | starting | working | report | failed | interrupted`), and the close dialog. An MR the URL names but the open set does not hold reads as `starting` — the hand-off starts the run on arrival, so that is what is about to happen — unless its start has already failed, which only the pane can report. `streamingRun(state)` answers "which run should the surface be watching", which is the only thing the presenter needs to wire `EventSource`.

## Cross-context dependencies

- `~/kernel` — `ExplainTab`, `ExplainBlock`, `ExplainPhase`, `ExplainRunEvent`, `ExplainActivityLine`, and the four server-function result types.
- `~/coordinator` — `useExplainRuns`, `useStartExplain`, `useCloseExplain` (presenter only).
- `~/design-system` — the `Dialog` family, and `code-highlight` (the shiki singleton extracted from Detail's ADF code block when Explain's finding hunks became its second consumer).
- `~/lib` — `cn`, `testIds` (view only).
- `mermaid` — `import()`-ed per diagram block, so a report without one pays nothing.
- `react-markdown` + `remark-gfm` — the narrative block's own prose styling, **not** Detail's `NotesMarkdown`. A report is denser than a note, and reaching into another context for a style sheet is exactly what the no-cross-context law forbids.

No imports from `~/contexts/<other>`. Detail hands merge requests here by **navigating** to `/explain?mr=<iid>` and never importing this context (ADR-0009 §3) — the palette's `?ai=` hand-off one level up, where the target is a whole surface rather than a modal inside a panel.

Pinned by `explain-domain-only-imports-kernel`, `explain-application-only-imports-kernel-and-self`, and `explain-view-model-only-imports-kernel-and-domain`.

## Public surface

```ts
export { useExplain, type ExplainApi } from './presenter'
export { CloseTabDialog, ExplainReportPane, ExplainTabs } from './view'
```

`routes/-explain/ExplainShell.tsx` composes those three with `AppChrome`. Internal types (`ExplainState`, `ExplainEvent`, `LiveRun`, `ExplainPaneDisplay`, the eight block renderers) are not re-exported.

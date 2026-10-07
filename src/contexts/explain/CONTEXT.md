# Explain

Owns the `/explain` surface: an **architect-altitude explanation of one merge request**, produced by a headless read-only Claude agent working in a throwaway detached worktree of the MR's head commit, streamed live into a tab, and rendered from a typed, **chaptered** report — an overview plus one page per **move**, navigated from a rich left rail ([ADR-0010](../../../docs/adr/0010-explain-report-as-a-chaptered-document.md)).

It is deliberately **not a diff viewer**, and deliberately **not a code review** ([ADR-0011](../../../docs/adr/0011-explain-explains-the-model-cell.md)). A diff answers "what changed on line 44" and a review bot answers "what is wrong with it"; the reader has both. This context's work is, in order: **group** the merge request into the moves it makes, **explain** each one — what the system looks like now, which domain types it introduces or reshapes, what shape it leaves — and only then **judge** it: blast radius, fit, and the questions worth asking the author. A finding is a footnote on an explanation, which is why the pane renders every finding below the cells that explain the move. The decisions are recorded in [ADR-0009](../../../docs/adr/0009-explain-surface-and-long-running-agent-runs.md), [ADR-0010](../../../docs/adr/0010-explain-report-as-a-chaptered-document.md) and [ADR-0011](../../../docs/adr/0011-explain-explains-the-model-cell.md); it replaced **Review MR**, which spawned a cmux workspace running `lumen diff --mr N`.

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

**Move** (kernel `ExplainMove`):
One **logical change** running through the merge request — something the author did on purpose, with files under it. Not a file, not a hunk, not a system: a decision. `{ id, title, summary, systems, paths, blocks }`, and it is both a **rail entry** and a **notebook page**. `summary`, `systems` and `paths` are required for the same reason `finding.whyItMatters` is: the rail is what the reader scans, and an entry that can only state a title is a table of contents. The grouping is the one piece of analysis a diff viewer structurally cannot do.

`id` is a lowercase hyphenated slug the agent writes, unique in the report, and it must contain a letter — an all-digit id is an index wearing a slug's clothes, and an index would silently repoint every shared link on the next re-run. A `?move=` the report does not contain falls back to Overview.

**Report** (kernel `ExplainReport`):
`{ version: 2, overview: Block[], moves: Move[] }`. `overview` is everything about the merge request rather than one move — the verdict, the systems table, the blast radius, the questions, the unverified list — and it is the rail's pinned first entry, where the surface lands. **No migration from v1:** a v1 record on disk reads as absent (`decodeRecord` rejects a report that does not validate) and the tab therefore reads `interrupted — re-run`, which is the honest answer for an artifact one agent run regenerates.

**Block** (kernel `ExplainBlock`) — the **cell** vocabulary:
A discriminated union of `verdict`, `systems`, `narrative`, `diagram`, `model`, `diff`, `finding`, `blast-radius`, `questions`, `unverified`. Validated by Zod at the server boundary, once; matched in the view by `renderBlock` with `ts-pattern.exhaustive()`, so **adding a block type is a compile error until it has a renderer**. Chaptering the report changed only _where_ a list of cells appears — the overview has one and so does every move — and nothing about how one is drawn. `diff` is the cell chaptering added: a hunk the agent chose with a `caption` saying what to look at, distinct from `finding.hunk`, which exists to back a claim — and it is **evidence for a sentence in the prose, not the body of a page**, because a page made of hunks is the diff viewer this surface replaced.

**Model** (kernel `ExplainBlockOf<'model'>`, `domain/model-diagram`):
The shape of the domain after the change — entities, the fields worth showing, and how they relate — drawn as an entity-relationship diagram. The cell the surface was missing: a merge request that adds a dozen domain types was being explained in prose and hunks when the thing wanted was the picture.

The agent sends **data, not a drawing**, and `mermaidForModel` generates the `erDiagram` (ADR-0011 §2). That is not ceremony: mermaid's ER attribute word is `[*A-Za-z_][A-Za-z0-9\-_[\]().,*]*`, so `Record<string, Member>` and `string | null` — most of a TypeScript domain — are parse errors; a relation label left unquoted collides with the `one` and `many` cardinality keywords; and `%` inside a quoted name is a syntax error. The generator rewrites rather than rejects (`Record~string,Member~`, `string-or-null`, `readonly_Foo[]`), always quotes labels, and names entities through mermaid's alias form (`e1["@sdk/usergroup"]`) so the picture can use the name the code uses. Each rule was verified against the installed mermaid, not read off its documentation, which is wrong about the first one.

`kind` (`added | changed | existing`) is **required** on every entity, because "which of these types are new" is the first question asked of a model and the one fact a box cannot carry; it is rendered as the entity's outline colour and as a badge in the cell's **legend**, which also carries each entity's note and is what survives a diagram that will not draw. Cardinality is multiplicity only — `one-to-one`, `one-to-many`, `many-to-many`, `one-to-optional` — and the `label` carries the verb. A relation naming a type the cell never described is **rejected at the boundary**: an edge into the void reads as the model rather than as an omission.

**Altitude** (`domain/block-altitude`):
The schema enforces it by what it cannot express — no `nit` severity, a `finding` cannot exist without the `system` it concerns and a `whyItMatters`, and a `model` cannot exist without saying which of its types are new. What is left for the domain is reading order, and `layOutReport` runs **per page**: every explanatory cell first in the agent's own order, then the findings — worst severity first regardless of what the agent wrote, findings about one system kept together — then `unverified` last of all.

The findings **sink** (ADR-0011 §4). They used to be lifted to the position of the first one, which let a move page open with a warning, and a page that opens with a warning is a code review whatever the cells under it say. `unverified` stays at the bottom because it is the report's caveat rather than part of what it found. Everything else keeps the agent's order: re-sorting the argument itself would be the view second-guessing the report's structure, which that function's own comment forbids.

**The rail's order** (`domain/moves`):
A move's attention level is the **worst severity among its own findings**, rolled up (`worstSeverityOf`) rather than stated by the agent — a severity field beside the findings it would be derived from is a second source of truth for one fact. A move with no findings gets `null`, and the rail shows no dot rather than a reassuring green one. The **moves themselves are never re-ordered**: their order is the agent's reading order, and re-sorting them would be the view second-guessing the report's structure, which is what `layOutReport`'s own comment forbids for cells.

**The whole diff** (`domain/moves`' `moveDiffFor`, kernel `ExplainDiffFile`):
A move page's `diff` cells are curated, which is a judgement the reader must be able to check — so every move page can expand the merge request's **real** diff, narrowed to the move's `paths`. It is a **live** read (`getExplainDiffs`), so it names the commit it is showing, which may be later than the one the report describes; and a path the merge request no longer contains is reported as **missing** rather than dropped, because a move whose files have moved on is itself a staleness signal. Matching is exact first, then either path as a suffix of the other.

**Viewport** (`domain/diagram-viewport`):
A diagram's `scale` and offset, and the three moves that change them — `zoomAbout`, `panBy`, `wheelZoomFactor`. Inline, a diagram is a **thumbnail**: mermaid scales it to the report column, which for anything structural enough to be worth drawing is too small to read, so the figure is a button into `DiagramOverlay` — the same SVG, window-sized, dragged and zoomed. Both drawing cells go through one `MermaidFigure`, so a model of a dozen entities opens into the same overlay a flowchart does, and needs it more. The invariant the arithmetic exists for is that the content under the cursor does not move when you zoom at it.

**Freshness** (`domain/stale-commits`):
`current | moved-on | unknown`. A report is pinned to the commit it describes, so the MR can move on underneath it; `unknown` is honest ignorance (GitLab unreachable) rather than "fine". The warning names the new head rather than counting commits — a count would need a compare call GitLab was not asked for.

_Avoid_: "review" as a noun for the tab, and "review" as a verb for what the agent does (it _explains_; an **explain run** is the noun — Review MR is the thing this replaced); treating `interrupted` as an error (nothing was lost but the run); re-sorting a report's moves in the view; "change" as a synonym for a move (`systems[].change` already means something else, which is why the word is `move`); "section" or "chapter" as near-synonyms for a move; the word "diff" for what this produces.

## Use-cases

There is **no context-local application service**. As in `bulk-refine`, both halves are coordinator hooks over server functions, and neither Jira nor GitLab is reached from here.

| What           | Coordinator hook   | Server function                             | Notes                                                                                                                                                                                                                                                       |
| -------------- | ------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the open set   | `useExplainRuns`   | `listExplainRuns` (`explain.ts`)            | Every persisted record, joined with any live run, plus each MR's current head for the stale warning. One query for the whole strip.                                                                                                                         |
| start / re-run | `useStartExplain`  | `startExplain`                              | Resolves the MR (head SHA, target branch, description, threads) and the ticket, then starts a run. One call for both: a start for an MR that has a tab supersedes it.                                                                                       |
| close          | `useCloseExplain`  | `closeExplain`                              | Deletes the report, aborts a run in flight, and removes the worktree — all three, server-side.                                                                                                                                                              |
| watch a run    | `useExplainStream` | `GET /api/explain/:runId/stream` (ADR-0006) | SSE. `EventSource`, closed by this side on the terminal message so it never reconnects to a finished run. A `404` (a run the server has forgotten) closes once and reports it lost.                                                                         |
| the whole diff | `useExplainDiffs`  | `getExplainDiffs`                           | **Fetched only once a move page asks.** Gated on the iid rather than a boolean, so switching tabs cannot leave the previous tab's request applied to the new one; cached per merge request, so every move's expander on one report is free after the first. |

> **The skill is half of the report contract.** The schema says what a cell may be; `.claude/skills/explain-mr/SKILL.md` is the only place the agent learns a cell's **field names**, and nothing type-checks that half. `explain-skill.test.ts` walks the cell union by introspection and fails if the skill does not name a type or a required field — added after a rewrite dropped the `diagram` cell's worked example and a real run was rejected for a `mermaid` field the instructions no longer mentioned. `EXPLAIN_SKILL_PATH` lives in `explain-agent.ts`, beside the argv and the prompt, because all three are one thing: what the agent is told.

> **Dev-server note.** The run registry is pinned on `globalThis` (`explain-registry.ts`), so it is built once per process and its closures hold the module instances they captured then. HMR cannot reach them: after editing any `explain-*` server module — the report schema above all — **restart the dev server**, or the previous contract will go on rejecting the current agent's reply and re-running will not help. The skill body is the exception; it is read from disk per run.

The run itself lives server-side in `server/lib/explain-runs.ts` — a process-scoped registry, deliberately **not** an Effect service (local process state, injected deps, unit-testable with a fake runner and clock). The agent runs read-only by construction: `--permission-mode dontAsk`, `--strict-mcp-config`, an explicit read-only allowlist, a deny list naming every write-shaped tool, and a `cwd` scoped to a worktree clashboard throws away. **Nothing is written by the agent at all** — the report comes back on stdout and clashboard persists it.

## View-model state machine

`ExplainState` is `{ tabs, loaded, selected, live, closing, starting, startErrors }`; `reduce(state, event)` is exhaustive over the event union (`ts-pattern.exhaustive()`), and each arm that depends on phase is exhaustive over phase.

- **`tabsLoaded`** takes the server snapshot as the open set, keeps an overlay whose `runId` the server still agrees with, and drops the rest — a stale overlay must not outlive the thing it described. `loaded` exists because "no tabs" and "not loaded yet" are different panes.
- **`selected`** mirrors `?mr=`, and **`selectedMove`** mirrors `?move=`. `lastMove` is the one piece of selection state that is _not_ in the URL: the move last read in each tab, read only to decide what the presenter puts in the URL when the reader switches tabs, so a half-read report is not restarted from the top. The URL stays the single source of what is on screen. **`runRequested`** is the click rather than its answer: a start spends a second or two reading the MR and the ticket before a run — and therefore a tab — exists, and `starting` is what lets the pane say so instead of showing "no reviews open" on a hand-off or the superseded report on a re-run. **`runStarted`** appends the tab and selects it _before_ any refetch, or a ten-minute run would start invisibly. **`startFailed`** records a start that never produced a run, so there is no stream to carry its message.
- **`streamEvent`** folds one SSE message into the overlay, ignoring any message whose `runId` the tab has replaced. **`streamLost`** reads a drop _during_ a run as `interrupted` and a drop after one as nothing new.
- **`closeRequested` / `closeDismissed` / `closed`**: closing selects the **neighbour** rather than dropping the reader onto the empty surface with other reviews still open. The presenter skips the confirmation entirely when `closeCostsARun` is false (a failed or interrupted tab costs nothing to reopen).

`deriveExplain(state)` projects the tab strip, one pane (`loading | no-tabs | none-selected | starting | working | report | failed | interrupted`), and the close dialog. A `report` pane also carries the **rail** (`ExplainRailEntryDisplay`: the pinned Overview entry with its verdict chip, then one entry per move with its summary, systems, file count and rolled-up severity) and the selected **page** (`ExplainPageDisplay`: `overview | move`). An MR the URL names but the open set does not hold reads as `starting` — the hand-off starts the run on arrival, so that is what is about to happen — unless its start has already failed, which only the pane can report. `streamingRun(state)` answers "which run should the surface be watching", which is the only thing the presenter needs to wire `EventSource`.

## Cross-context dependencies

- `~/kernel` — `ExplainTab`, `ExplainBlock`, `ExplainPhase`, `ExplainRunEvent`, `ExplainActivityLine`, and the four server-function result types.
- `~/coordinator` — `useExplainRuns`, `useStartExplain`, `useCloseExplain`, `useExplainDiffs` (presenter only).
- `~/design-system` — the `Dialog` family, and `code-highlight` (the shiki singleton extracted from Detail's ADF code block when Explain's finding hunks became its second consumer).
- `~/lib` — `cn`, `testIds` (view only).
- `mermaid` — `import()`-ed per figure, so a report without one pays nothing.
- `react-markdown` + `remark-gfm` — the narrative block's own prose styling, **not** Detail's `NotesMarkdown`. A report is denser than a note, and reaching into another context for a style sheet is exactly what the no-cross-context law forbids.

No imports from `~/contexts/<other>`. Detail hands merge requests here by **navigating** to `/explain?mr=<iid>` and never importing this context (ADR-0009 §3) — the palette's `?ai=` hand-off one level up, where the target is a whole surface rather than a modal inside a panel.

Pinned by `explain-domain-only-imports-kernel`, `explain-application-only-imports-kernel-and-self`, and `explain-view-model-only-imports-kernel-and-domain`.

## Public surface

```ts
export { useExplain, type ExplainApi } from './presenter'
export { CloseTabDialog, ExplainReportPane, ExplainTabs } from './view'
```

`routes/-explain/ExplainShell.tsx` composes those three with `AppChrome`. The rail and the notebook are **inside** `ExplainReportPane`, not separate exports: they only ever appear together, and a report pane composable without its rail would be a shape nothing wants. Internal types (`ExplainState`, `ExplainEvent`, `LiveRun`, `ExplainPaneDisplay`, `ExplainRailEntryDisplay`, `ExplainPageDisplay`, the ten cell renderers) are not re-exported.

# The Explain report is a chaptered document: moves, and a notebook

The Explain report stops being one flat list of blocks and becomes a **chaptered document**. The agent groups the merge request into **moves** — the logical changes running through it, each one a thing the author decided to do, rather than a file or a hunk. A **rich left rail** lists them; selecting one opens that move as a **notebook page**: prose cells, diff cells, and diagram cells in the order that explains it. The rail's first entry is **Overview**, which carries everything that is about the whole merge request rather than about one move.

This **amends ADR-0009 §7 and §8**. Everything else in ADR-0009 stands: the surface, the per-MR tab strip, the run registry, the SSE channel, the throwaway detached worktree, and the read-only agent posture are all unchanged. What changes is the shape of the thing the agent returns and the shape of the pane that renders it. The report version goes `1 → 2`.

The driver is that the flat report answered ADR-0009's four questions — which systems, which contracts, what blast radius, does the shape fit — but answered them **about the merge request as a whole**, and a real merge request is not one change. It is three or four, usually: a contract moved, a cache added, a call site adapted, a helper deleted. A flat report forced all of them through one `narrative` block and one undifferentiated findings list, so the reader had to re-separate what the agent had already separated in its head. Grouping is the one piece of analysis an agent can do that a diff viewer structurally cannot — GitLab can sort hunks by path, and nothing but a reader can tell you that two of those paths are the same decision.

The ultimate driver is the same team-template lesson ADR-0009 names, taken one level further: when the agent's output is a typed domain object, **the shape of that object is where the product decisions live**. "A report is a list of blocks" permitted a wall of text. "A report is an overview plus N moves, each a list of cells" cannot express one, because the grouping is a required field rather than a thing the prose might happen to do.

## Considered options

### 1. What the unit of grouping is called

The rail groups the merge request by something; whatever that something is named appears in the schema, in the agent's instructions, in the URL, and in the rail's own header, so it is worth choosing deliberately.

- **(a) `change`.** The plainest word, and the one the feature request used. _Rejected:_ `systems[].change` already exists and already means something else — `added | changed | contract-changed | removed | read-only`, how a change touches one system. Two different things sharing a word in the same schema is the cost, and renaming the older field to buy the newer one trades a settled vocabulary for an unsettled one.

- **(b) `chapter`.** Fits the notebook metaphor and reads well in a rail. _Rejected:_ it describes the **rendering** rather than the thing. A chapter is a unit of a document; what the rail lists is a unit of the merge request, and the document is downstream of that. It also instructs the agent badly — "find the chapters in this merge request" asks for a table of contents, not an analysis.

- **(c) `thread`.** "The threads of change running through this merge request" is close to right. _Rejected:_ GitLab review threads are already in this feature's vocabulary — `getMrDiscussions`, `discussionsToText`, "the MR thread" in the prompt the agent reads. The collision is with something the agent itself is given.

- **(d) `move`.** _Selected._ "This merge request makes four moves." A move is **something the author did on purpose**, which is exactly the unit an architect reviews: not a file, not a hunk, not a system, but a decision with files under it. It is unused anywhere else in the codebase, it is short enough for a rail label and a URL (`?move=rounding-leaves-pricing`), and it instructs the agent well — "what are the moves in this change" is a question with an analytic answer, where "what are the chapters" is a question about formatting.

Consequence: `ExplainMove`, `report.moves`, `?move=`, and the rail header reads "4 moves". The word "section" is avoided as a near-synonym that would drift back in.

### 2. Where the whole-MR material lives

The verdict, the systems table, blast radius, open questions and the unverified list are about the merge request, not about one move. They need a home that does not make them look like a move.

- **(a) A pinned Overview rail entry.** _Selected._ The rail's first entry is **Overview**, visually separated from the numbered moves, and it is what the surface lands on. It holds the verdict, the systems table, any whole-MR narrative, the blast radius, the questions and the unverified list.

  Two things make this the right one rather than merely the easiest. The **reading order is preserved**: verdict first, then what it touches, then the moves one at a time, which is the order ADR-0009's skill already prescribed and the order an architect actually reads in. And **the rail stays one kind of thing** — a list of pages, top to bottom — so navigating it needs no explanation and the keyboard story later is a list, not a list plus two special cases.

- **(b) A verdict header above the rail, and a pinned Risk entry at the bottom.** _Rejected:_ the verdict is the one line you want permanently visible, which is a real argument, but it buys that by splitting the whole-MR material across two places — a header and a trailing entry — and by putting blast radius **after** the moves, which inverts the "conclusion first" register the report is written in. The verdict stays visible a cheaper way: the Overview entry carries a verdict chip in the rail, so the conclusion is on screen from every move without a second region to own it.

- **(c) No pinned entries; the whole-MR material becomes a fixed header strip.** _Rejected:_ densest, and briefly attractive because every move then shows the verdict and the systems. But blast radius and the unverified list are long — a table and a list of caveats — and a header tall enough to hold them is a header that crowds every notebook page with material the reader has already read. The pane would spend its vertical budget on the part that does not change.

### 3. The pane layout, and the per-MR tabs

The tab strip stays exactly as ADR-0009 §2 defined it: left-aligned, horizontal, one tab per merge request, derived from `~/.clashboard/explain/`. The move rail lives **inside** the selected tab's pane, to the left of the notebook.

- _Rejected — one two-level left rail (MR, expandable to its moves), dropping the horizontal strip._ One navigation surface instead of two is genuinely tidier, and it is the shape a file tree would take. But it conflates two different kinds of navigation: tabs are **concurrent long-running jobs** you switch between while they work, and the rail is a **table of contents** within one finished document. The tab strip carries a live spinner, a close control, and a confirmation dialog; folding it into a tree would put all three on tree rows and make "close" ambiguous between a merge request and a move. ADR-0009's tab identity is also the thing the SSE channel, the persisted open set and the stale-report warning are all keyed on, and none of that wants to be a tree node.

The resulting pane is: tab strip across the top, then a two-column body — rail left, notebook right — with the MR header and the stale-report warning above the body, where they already are, because both are about the merge request and belong above the thing that is about one move.

### 4. A move is a rail entry and a page, so the schema carries both

```ts
ExplainMove = {
  id: string            // slug, unique in the report; the URL names it
  title: string         // "Rounding leaves the pricing service"
  summary: string       // one line — the why, for the rail
  systems: string[]     // the rail's chips
  paths: string[]       // the files this move spans
  blocks: ExplainBlock[] // the notebook page
}
```

- **`id` is a slug the agent writes, not an index.** A number in the URL would change meaning on every re-run, so a link to a move would silently point at a different one. A slug can go stale — a re-run that no longer has that move — and a stale slug falls back to Overview, which is honest. Uniqueness within a report is validated at the boundary rather than deduplicated in the view, because a report with two moves claiming one id is a malformed report, not a rendering problem.
- **`summary` is required and `systems` is non-empty**, for the same reason `finding.whyItMatters` and `finding.system` are required (ADR-0009 §7): the rail is the thing the reader scans, and a rail entry that is only a title is a table of contents. Altitude is enforced by what the schema cannot express — a move that cannot name a system it touches is a file list.
- **`paths` is required and non-empty.** It is what makes the whole-diff expander (§6) possible, and a move with no files under it is not a move.
- **No severity field.** A move's attention level is the **worst severity among its findings**, rolled up in the domain. An agent-stated severity beside the findings it is derived from is a second source of truth for the same fact, and a move with no findings honestly has no dot.

`version` becomes `2` and the envelope is `{ version: 2, overview: Block[], moves: Move[] }`. **No migration shim:** a v1 report on disk already reads as absent (`decodeRecord` rejects a report that does not validate), and a record with no report already reads as `interrupted — re-run`. A report is a regenerable artifact whose whole cost is one agent run, so the honest behaviour is to ask for the run rather than render half of an old contract in a new pane.

### 5. Blocks stay the cell vocabulary

The eight block types stay, matched by `renderBlock` with `ts-pattern.exhaustive()` exactly as before — the invariant that adding a block type is a compile error until it has a renderer is untouched. What changes is only **where** a list of blocks can appear: the overview has one, and each move has one.

- _Rejected — a separate, narrower cell union for moves._ A move page has no business holding a `verdict`, and a type that said so would be stricter. But it would mean two unions, two exhaustive matches and two renderers for the six types they share, to prevent a mistake the agent has no reason to make and which renders harmlessly if it does. The grouping is what this ADR buys; narrowing the cell union is a separate change that can be made later from evidence.

`layOutReport` — the findings-worst-first rule — now applies **per list** rather than once per report: to the overview's blocks and to each move's blocks independently. Its reasoning is unchanged and so is its code; it is simply called in more than one place. Re-ordering the **moves** themselves is deliberately not done: their order is the agent's reading order, and re-sorting them by severity would be the view second-guessing the report's structure, which is the thing that function's own comment forbids.

### 6. Diff cells: curated hunks in the report, the whole diff on demand

"Explain this move with text, diffs and graphs" needs diffs that are not attached to a finding, because most of what a move does is not a problem.

- **A new `diff` block.** `{ path, language?, caption?, diff }` — one file per cell, the same shape `finding.hunk` already has, plus a caption saying what to look at. The agent picks the hunks that carry the move and says why each one matters. This is the notebook's main diff cell: it costs no new plumbing (the agent has the worktree), it keeps reports small, and a curated hunk with a sentence over it is the thing a flat diff cannot be.

- **Plus a whole-diff expander per move.** _Selected together with the above._ Curation is a judgement, and a reviewer must be able to check what the curation left out — otherwise the surface asks for trust it has not earned. So every move page carries a **"show the whole diff"** control that fetches the merge request's real diff and shows the files the move's `paths` name.
  - _Rejected — curated hunks only._ Smaller and simpler, but it makes the report unfalsifiable from inside itself. The reader's only recourse is GitLab in another tab, which is the thing this surface exists to replace.
  - _Rejected — full per-change file diffs in the report._ Nothing hidden, but the diff text would have to be plumbed into the report and persisted with it, making every record large on disk and every report a diff viewer by default — which is what ADR-0009 says this surface is deliberately not. Fetching on demand keeps the report a report.

  The fetch is **not** part of the report: `GitlabGateway.getMrDiffs` plus a `getExplainDiffs` server function, fetched once per merge request and shared by every move's expander, matched against `move.paths`. It is a live read of GitLab, so it describes the merge request **now** rather than the commit the report describes — the same divergence the stale-report warning already names, and the expander says which commit it is showing for that reason. Paths the merge request no longer contains are reported as unmatched rather than silently dropped; a move whose files have all moved on is itself a staleness signal.

## Consequences

- **The report version is 2, and v1 reports are not readable.** Open tabs carrying a v1 report read as `interrupted — re-run` after this lands. That is the existing path for "the report is gone but the tab is not", exercised by a new case rather than new code.
- **A new leaf vocabulary word, `move`,** in the kernel (`ExplainMove`), the schema, the prompt, the skill, the URL, and the rail. `src/contexts/explain/domain/moves.ts` owns its rules: the severity roll-up, the lookup by id, and the path matching the expander needs.
- **`?move=` joins `?mr=` in the URL.** A move is a thing the user can link to and the back button can return to — ADR-0007's rule, applied one level down. A `?move=` the report does not contain falls back to Overview rather than erroring, the same way a bad `?mr=` falls back to the list.
- **The view-model remembers the last move read per tab.** Switching merge-request tabs and coming back lands where the reader left off rather than on Overview. It is a per-tab map in the view-model, projected into the URL by the presenter — the selection itself stays URL-owned, and the memory is only what the presenter puts in the URL when the tab changes.
- **The GitLab gateway grows a seventh method,** `getMrDiffs`, and Explain grows a fifth server function. This is the first time Explain reads GitLab for something the agent did not already put in the report.
- **`src/routes/api/` is untouched,** and so is the run registry, the agent posture, the worktree lifecycle and the close semantics. This ADR changes a contract and a pane; it does not change how a run works.

## Tests

| Layer          | How                                                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Report schema  | The existing table, extended: a v2 report, the `diff` block, a move missing `summary` / `systems` / `paths`, two moves sharing an `id`, and a **v1 report rejected** — the behaviour the no-shim decision rests on.             |
| `moves.ts`     | Pure unit: the severity roll-up over a move with no findings and with several, lookup of a missing id, and path matching including the unmatched case.                                                                          |
| GitLab adapter | The existing wire-schema pattern: `/diffs` decoded, a renamed file, a deleted file, and a transport failure.                                                                                                                    |
| View-model     | Pure call/assert, extended over move selection: a valid `?move=`, an unknown one, the remembered move per tab, and the rail/page projection for both page kinds.                                                                |
| Cell renderers | The existing snapshot over a fixture report — now a v2 fixture with an overview and two moves, including a `diff` cell.                                                                                                         |
| End-to-end     | The existing Explain spec, extended: the rail renders with Overview plus the stub's moves, selecting a move shows its cells and puts it in the URL, and the whole-diff expander shows the move's files from a stubbed `/diffs`. |

## References

- ADR-0009 — the Explain surface. This ADR amends its §7 (the report is a typed block document) and §8 (diffs and diagrams); everything else there stands.
- ADR-0007 — multi-board app shell; `?move=` is its "a surface the URL can name" rule applied to a page within a tab.
- ADR-0003 — framework-free view-models; the rail and the page are projections, not components with state.
- ADR-0001 — mock at the network boundary; the `/diffs` read is stubbed by MSW, the agent by `CLASHBOARD_CLAUDE_BIN`.

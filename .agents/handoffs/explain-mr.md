# Handoff — Explain MR, ready for review

**What this is.** `.agents/prds/explain-mr.md` implemented in full: all nine slices. Everything is **uncommitted** in the working tree on `feat/command-palette` (base `acca199`). Nothing has been pushed.

**Read [ADR-0009](../../docs/adr/0009-explain-surface-and-long-running-agent-runs.md) first, then [the PRD](../prds/explain-mr.md).** Both were written before the code and both are accurate, so the review question is mostly "does the code say what those two say" — plus the five places where it deliberately does not (§3).

```
64 new files      ~8,700 lines (16 of them test/fixture/stub files)
41 modified       +578 / −219
1 deleted         src/contexts/detail/view/ReviewMrButton.tsx
319 new unit tests  ·  6 new e2e specs
```

---

## 1. First: what in this working tree is _not_ mine

The tree already had uncommitted work when I started. I did **not** touch it, and it should be reviewed (or committed) separately:

```
src/contexts/detail/CONTEXT.md
src/contexts/detail/view/adf/RenderAdf.tsx
src/contexts/detail/view/adf/RenderAdf.test.tsx
src/contexts/detail/view/adf/__snapshots__/RenderAdf.test.tsx.snap
src/contexts/detail/view/adf/nodes/index.ts
src/contexts/detail/view/adf/nodes/Table.tsx        (new)
src/contexts/detail/view/adf/nodes/TableRow.tsx     (new)
src/contexts/detail/view/adf/nodes/TableCell.tsx    (new)
tests/e2e/ticket-detail/adf-rendering.spec.ts
```

The one ADF file I _did_ change is `adf/nodes/HighlightedCode.tsx`, and only to import the extracted highlighter.

To see my changes without that noise:

```sh
git diff -- . ':!src/contexts/detail/view/adf' ':!src/contexts/detail/CONTEXT.md' \
  ':!tests/e2e/ticket-detail/adf-rendering.spec.ts' ':!docs/architecture.svg' ':!pnpm-lock.yaml'
```

---

## 2. Reading order

### If you read six files, read these

| File                                                    | Why                                                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/server/lib/explain-report.ts`                      | The contract the whole feature hangs off. Altitude is enforced by what the schema _cannot_ express. |
| `src/server/lib/explain-runs.ts`                        | The phase machine, the 2-run bound, abort/supersede. The most stateful thing in the change.         |
| `src/server/lib/explain-tab.ts`                         | The join rule: the file is the open set, the live run is the present tense.                         |
| `src/contexts/explain/view-model/explain-view-model.ts` | Same question on the client, plus the SSE reducer.                                                  |
| `src/routes/api/explain.$runId.stream.ts`               | The replay-then-subscribe ordering and when the stream closes.                                      |
| `src/contexts/explain/CONTEXT.md`                       | The vocabulary, in one page. Read it before the code if you prefer prose.                           |

### Full order, dependencies first

**Server, bottom up**

1. `git-worktree.ts` (new, 117) — primitives extracted from `open-workspace.ts`
2. `open-workspace.ts` (−63/+…) — now sits on them; **its test file is untouched**, which is the proof
3. `explain-worktree.ts` (129) — detached worktree at the MR head, under its own root
4. `explain-report.ts` (234) — Zod schema, `Block` union, `parseExplainReport`
5. `explain-agent.ts` (369) — argv, prompt, and the _only_ module that knows stream-json
6. `claude-cli.ts` (+152) — `cwd` / `timeoutMs` / `signal` options and `streamClaude`
7. `explain-store.ts` (201) — `~/.clashboard/explain/mr-<iid>.json`
8. `explain-runs.ts` (406) — the registry
9. `explain-tab.ts` (138) — the file × run join, `discussionsToText`, key-from-title
10. `explain-registry.ts` (207) — the one live instance, real deps wired
11. `server-functions/explain.ts` (228) — the four RPCs
12. `routes/api/explain.$runId.stream.ts` (130) — SSE
13. `gateways/gitlab/{types,http-adapter}.ts` — `targetBranch`, `headSha`, `description`, note `body`

**Client**

14. `kernel/explain.ts` (35) — type-only re-exports
15. `contexts/explain/domain/` — `block-altitude.ts` (108), `stale-commits.ts` (45)
16. `contexts/explain/view-model/explain-view-model.ts` (460)
17. `contexts/explain/presenter/` — `use-explain-runs.ts` (87), `use-explain-tabs.ts` (133)
18. `contexts/explain/view/` — tab strip, activity log, report pane, close dialog, 8 block renderers + `DiffHunk`
19. `design-system/code-highlight.ts` (166) — shiki singleton, extracted from Detail

**Routes and hand-off**

20. `routes/-app-chrome.tsx` (90) + `-app-shell.tsx` (−86/+…) — the chrome extraction
21. `routes/explain.tsx`, `routes/-explain/ExplainShell.tsx`
22. `-header/Header.tsx`, `-nav/NavRail.tsx` — `ShellVariant`, third rail item, `aria-label="Surfaces"`
23. `-command-palette/{action-legality,use-action-catalogue,global-commands,use-board-commands}.ts`
24. `contexts/detail/{presenter/use-explain-handoff.ts, view/ExplainMrButton.tsx}` + `ReviewMrButton.tsx` deleted
25. `server-functions/detail.ts` — `reviewMr` and `ReviewMrResult` deleted

---

## 3. Decisions that diverge from the PRD — review these first

Three are genuine design divergences; two are side-effects I chose to accept. All five are deliberate and argued in code comments, but they are the places where you may simply disagree.

### 3.1 The tab record is written **pending**, at run start

`explain-store.ts`'s `ExplainRecord` has `report: ExplainReport | null` and a `startedAt`, and `explain-runs.ts` persists it before the first event.

The PRD derives the tab set from `~/.clashboard/explain/` and describes the file as holding a report. Writing only on completion would make a dev-server restart lose the tab entirely, contradicting user story 4 ("the tab set survives a dev-server restart"). A pending record with no live run is now _precisely what `interrupted` means_ — see `projectExplainTab`.

**Cost:** a re-run blanks the old report on disk the moment it starts, so a failed re-run loses the previous report. I think that is right (the old report describes a commit the MR has moved past), but it is a product call worth confirming.

### 3.2 `parseExplainReport(reply: string)`, not `(runResult)`

The PRD writes `parseExplainReport(runResult)`. I kept `explain-report.ts` free of any CLI knowledge: `explain-agent.ts` owns `activityFor`, `finalReplyFrom`, and `streamErrorFrom`, and the registry composes them. That is what ADR-0009 §4's "a CLI output-format change breaks exactly one module" actually requires — a parser taking a `ClaudeRunResult` would be a second module knowing the envelope.

### 3.3 Staleness names a SHA, it does not count commits

ADR-0009 §5 imagines a tab saying "3 new commits since this report". `domain/stale-commits.ts` says `current | moved-on | unknown` and the banner reads "its head is now `abc1234`".

A count needs a GitLab compare endpoint that no file in the PRD's inventory provides, and a number nobody verified is worse than a SHA you can check. `stale-commits.test.ts` has an explicit test that we _don't_ claim a count. If you want the count, it is one new gateway method plus a field on `ExplainTab`.

### 3.4 Side-effect: the extracted highlighter gained language aliases

`design-system/code-highlight.ts` adds `LANGUAGE_ALIASES` (`ts`→`typescript`, `yml`→`yaml`, …) because an Explain hunk's `language` comes from an agent, which writes `ts` as readily as `typescript`.

This also affects **Detail's ADF code blocks**, which now highlight aliases that previously fell through to plain text. Strictly more highlighting, never less — but it is a behaviour change to adjacent code, which CLAUDE.md §2 says not to make silently. Flagging it rather than burying it. The alternative was two resolution paths inside one shared primitive, which I judged worse.

### 3.5 Side-effect: `explain-mr` moved group, so one palette ordering changed

The PRD specifies the group move from `links` to `workflow`. `ACTION_GROUP_ORDER` puts Workflow first, so a fake review card now lists `explain-mr` above `open-mr`. One assertion in `palette-state.test.ts` was updated for it.

### Also worth knowing

- **`go-to-explain` palette command added.** Not in the PRD. The rail has three items and `globalCommands` offers "go to" for the two it had; leaving the third out would have been a visible asymmetry. Four lines in `global-commands.ts`, plus `filter-board` / `clear-board-filter` now suppressed on `/explain` (there is no card grid to narrow).
- **`BoardCommandsState`'s four board props became optional**, mirroring what the PRD specifies for `Header`. `/explain` passes none.
- **`verdictDemandsAttention` deleted.** I wrote it, nothing used it, and the PRD names only "severity ordering, group-by-system" for `block-altitude`. `groupFindingsBySystem` _is_ used — `layOutReport` orders through it, so findings group by system with the worst-hit system first.

---

## 4. Where I would look hardest

Ranked by how much damage a mistake would do, with the question I would ask.

1. **`explain-worktree.ts` — the discard path.** Everything about "close removes the worktree" rests on `explainWorktreePath` never resolving inside `~/projects/worktrees/dr-web/<KEY>`, where real work in progress lives. `assertIid` guards it and there is a test asserting the separate root, but this is the only code in the change that can destroy something. _Is the guard airtight?_
2. **`explain-runs.ts` — the concurrency slot.** Slots are a `Set` of run ids, released **only** by `execute`'s `finally`. `drop()` deliberately does not release, so an aborted run holds its slot until the agent actually stops. _Can a run leak a slot forever if a dep never settles?_ (The real `streamClaude` always settles — timeout or abort — but the invariant depends on that.)
3. **`explain-tab.ts:projectExplainTab` — report vs headSha.** During a live re-run the tab shows **no** report rather than the previous one, because pairing an old report with the new `headSha` would be a tab lying about which tree it describes. _Agree, or would you rather keep the old report visible while refreshing?_
4. **`explain.$runId.stream.ts` — close timing.** The stream closes on the `report`/`failed` _payload_, not on the terminal phase change that precedes it; closing a message earlier would truncate exactly the thing the tab needs. `interrupted` carries no payload so it closes on the phase. _Is there a terminal path I have missed?_
5. **`use-explain-runs.ts` — `EventSource` reconnection.** `EventSource` retries whenever the server closes the stream, which our server does on purpose at the end of every run. The client closes the connection itself on the terminal message and on `onerror`. _Is there a state where it reconnects in a loop?_ A 404 (a run the server forgot) closes once and reports `streamLost`.
6. **`explain-view-model.ts` — the `runId` guard.** Every stream event and `streamLost` is dropped if its `runId` is not the tab's current one. This is the whole safety of re-run. _Is there a path where a superseded run's message still lands?_
7. **`explain-agent.ts` — the allow/deny lists.** The containment claim is structural: nothing on the allowlist can mutate anything, `cwd` is the throwaway worktree, and the deny list names every write-shaped tool. _Is any allowed `Bash(git …)` subcommand actually a mutation?_ Tests assert the lists reach argv but cannot assert the semantics of git.

---

## 5. How to verify

```sh
pnpm typecheck     # clean (both tsconfigs)
pnpm lint          # 38 warnings, 0 errors   (master baseline: 35 warnings)
pnpm depcruise     # 0 violations, 519 modules / 921 dependencies
pnpm test          # 106 files, 1496 tests
pnpm test:e2e      # 88 tests, ~3.7 min (builds first)
pnpm check:arch    # STILL FAILS — advisory, and already failed on master
```

`check:arch`: 82 dead-code findings against a master baseline of 65. The remaining Explain entries are the kernel re-exports the PRD asks for plus two false positives (`projectExplainTab` and `useExplain` are both used). Per your standing note, not chased green.

### New unit suites

| Tests   | Suite                              | What it pins                                                                             |
| ------- | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| 17      | `explain-worktree.test.ts`         | exists × missing, per-step failure, the separate-root guarantee                          |
| 26      | `explain-report.test.ts`           | all 8 blocks, unknown type, missing `system`, no `nit`, truncated reply, prose/fences    |
| 39      | `explain-agent.test.ts`            | argv carries allow+deny lists, no `--restricted`, every stream event → its activity line |
| 32      | `explain-runs.test.ts`             | phase sequence, fan-out, 2-run bound, abort, supersede, persistence                      |
| 32      | `explain-store.test.ts`            | round-trip pending + finished, hostile files, the open-set listing                       |
| 21      | `explain-tab.test.ts`              | the file × run join, system-note filtering, key-from-title                               |
| 13      | `-explain-stream.test.ts`          | 404, content type, framing, replay, close timing (ADR-0006's route test)                 |
| 90      | `explain-view-model.test.ts`       | exhaustive over event × phase, plus the whole projection                                 |
| 14 + 12 | `block-altitude` / `stale-commits` | ordering + grouping; freshness, including "no fabricated count"                          |
| 23      | `blocks.test.tsx`                  | 18 snapshots over a fixture report carrying every block type                             |

### Checks that are not test assertions

- **`open-workspace.test.ts` is bit-for-bit untouched** and green — the extraction's only real proof. `git diff src/server/lib/open-workspace.test.ts` is empty.
- **The three new depcruise rules were observed failing** against a deliberate violation (an import of `~/lib/testids` into the view-model) before being relied on, per the house practice for `no-cross-context`.
- **mermaid is lazy.** In `dist/client/assets/explain-*.js` (38 KB) mermaid appears only as `import('./mermaid.core-*.js')`; it is in neither the initial chunk nor the Explain route chunk.
- **One manual run against a real MR has _not_ been done** — see §7.

### e2e

`tests/e2e/explain/explain-surface.spec.ts`, 6 specs. Two boundaries are stubbed and one deliberately is not:

- **GitLab + Jira** at HTTP, by MSW (ADR-0001).
- **The agent** at the process: `CLASHBOARD_CLAUDE_BIN` → `tests/e2e/stubs/claude-explain.mjs`, which emits canned stream-json. The agent is a subprocess, so the process is its boundary.
- **git is real.** `tests/e2e/fixtures/git-repo.ts` builds a bare `origin.git` plus a `projects/dr-web` clone under the suite's throwaway `HOME`, publishing a commit at `refs/merge-requests/<iid>/head`. The prepare step is genuine `git fetch` + `git worktree add --detach`, and the close test asserts the worktree directory is really gone. Stubbing git would have stopped the e2e covering the one part of the flow that touches disk.

Each spec uses **its own MR iid**, because the registry is process-scoped and the e2e server outlives the suite — a shared iid lets one test's finished run answer for the next test's tab.

---

## 6. Two things the e2e caught that unit tests could not

Both are already fixed; noting them because they are the kind of thing worth a second opinion.

1. **`listExplainRuns` was unioning disk records with in-memory runs.** A tab closed by deleting its file could resurrect from the registry. ADR-0009 §2 says the files _are_ the open set, so now they are, full stop — the registry is an overlay and never a source. (`server-functions/explain.ts`, the `listExplainRuns` handler.)
2. **The registry is pinned on `globalThis`.** Vite can re-evaluate a server module in dev; two registries would mean the RPC starts a run in one while the SSE route looks for it in the other, which reads as "the stream 404s for no reason" rather than the honest "the run was lost". (`explain-registry.ts`.)

---

## 7. Not done / known limits

Carried from the PRD's own scope boundaries:

- **No install, build, typecheck or test in the worktree** (ADR-0009 §6). The report's `unverified` block is where that is stated rather than hidden, and the skill requires it on every report.
- **The registry is in-memory.** A dev-server restart loses a run in flight (the tab reads "interrupted — re-run") and never a finished report.
- **`dr-web` only**, like every other worktree path in the app.
- **No `CLASHBOARD_HOME` override.** Renderers are covered by snapshots over a fixture.

Mine to flag:

- **No manual run against a real MR.** Slice 3's verify says "one manual run against a real MR, output inspected by hand", and slice 5/6/8 say "run the app". I could not do that from here: it needs your GitLab token, a real `~/projects/dr-web`, and an authenticated `claude`. **This is the one gap in the PRD's verification, and it is the gap most likely to surface a prompt-quality problem** — the schema is tested, but whether the agent reliably _fills_ it well is unmeasured. Suggested first run: a small MR you already understand, then check the `unverified` block is honest and no finding is a nit.
- **Finished runs are never evicted from the registry.** Bounded by distinct MRs reviewed per dev-server lifetime, each holding one report. Not a leak worth machinery, but it is unbounded in principle.
- **Four `max-lines` / `max-dependencies` lint warnings** on `explain-runs.ts`, `explain-view-model.ts` and `server-functions/explain.ts`. The repo already carries the same warnings elsewhere (`server-functions/detail.ts` has ten), so I left them rather than splitting files to satisfy a warning.

## 8. Open questions for you

1. **Commit shape.** The PRD structures this as nine independently committable slices and your history is slice-per-commit (`slice 85`…`slice 89`). I left everything uncommitted because the tree also carries your in-flight ADF-table work. Do you want it as nine commits, one commit, or left alone?
2. **§3.1** — is blanking the old report when a re-run starts the behaviour you want?
3. **§3.3** — do you want the commit count, at the cost of a new gateway method?
4. **§3.4** — keep the language aliases in the shared highlighter, or confine them to Explain?

---

## 9. Review round 1 — the three things you found

All three are fixed in the working tree. Still uncommitted, same branch.

### 9.1 The rail stopped marking Explain while a review was open

`NavRail`'s links were `activeOptions={{ exact: true }}`, and TanStack Router's `includeSearch` **defaults to `true`** — so `/explain` stopped matching the moment the URL became `/explain?mr=4211`. Now `{ exact: true, includeSearch: false }`: a surface is a pathname, and `?mr=` / `?issue=` select *within* one. The same bug applied to Board with a ticket open; one line fixes both. Pinned by an assertion in the detail-hand-off e2e.

### 9.2 Clicking Explain landed on the empty state

`startExplain` reads the MR, its threads, the ticket and the note before a run — and therefore a tab — exists, and `deriveExplain` had nothing to say for an MR the URL named but the open set did not hold, so it fell through to `none-selected` / `no-tabs`: "No reviews open", which reads as the feature not working.

- New `runRequested` event and `starting: ReadonlySet<number>` in `ExplainState` — the click, dispatched before the call rather than after it.
- New `starting` pane, matched exhaustively like the rest: a spinner, `!<iid>` and what is happening.
- It also covers the **re-run**, which previously showed the superseded report for the length of the call, and surfaces a **start failure for an MR with no tab** (a bogus `?mr=99999` used to fail silently to the empty surface).
- The start-on-arrival latch moved into `useStartOnArrival` and is now scoped to the **selection** rather than to the iid. That matters: a latch keyed by iid that is cleared on close restarts the run you just closed, because the tab leaves the open set a commit before the URL stops naming it. Both close e2e specs caught exactly that.

### 9.3 Diagrams were unreadable

Inline, a diagram is now explicitly a thumbnail with an **Expand** action (the diagram itself is also the button), opening `DiagramOverlay`: the same sanitised SVG at window size, drag to pan, wheel to zoom at the cursor, `+` / `-` / `0`, Escape to close, and a zoom readout.

- `domain/diagram-viewport.ts` holds the arithmetic, pure — the invariant being that the content under the cursor does not move when you zoom at it (17 tests).
- `DiagramOverlay.test.tsx` covers the wiring: every control, the drag, the keys, the clamp (8 tests).
- The wheel listener is attached non-passively through a ref callback with a cleanup, because React's `onWheel` is passive and `preventDefault` there zooms the browser instead of the diagram.
- `[&_svg]:!max-w-none` in the overlay overrides the inline `max-width` mermaid writes on the SVG — that cap is what made it small. The inline rendering is deliberately **unchanged**: for a wide diagram it is already at column width, and stretching a two-node graph to 768px would only make it odd.
- The e2e stub report gained a diagram block (so `blocks` is 8, not 7) and a new spec drives the overlay with real mermaid and a real mouse drag.

**Verification:** `pnpm typecheck` clean · `pnpm lint` 38 warnings, 0 errors (unchanged baseline) · `pnpm depcruise` 0 violations · `pnpm test` 108 files, 1529 tests · `pnpm test:e2e` 89 passed. `check:arch` still advisory-failing, not chased.

Open questions from §8 are untouched — none of this round answers them.

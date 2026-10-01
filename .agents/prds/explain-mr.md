# Explain MR

## Problem Statement

Reviewing a merge request as an architect is not reviewing a diff. The diff answers "what changed on line 44"; the architect needs to know which systems the change touches, how it changes their contracts, what the blast radius is if it is wrong, and whether the shape fits the system it is landing in. Today clashboard's answer is **Review MR** — a button that spawns a cmux workspace running `lumen diff --mr N`. It is a diff viewer in a terminal. It answers the line-44 question and none of the others, and it hands the reviewer a wall of hunks to derive the rest from by hand.

Meanwhile clashboard already owns every ingredient a better answer needs: git worktrees and cmux (`server/lib/open-workspace.ts`), a headless Claude runner (`server/lib/claude-cli.ts`), and a GitLab gateway. Review MR used one of them.

## Solution

Replace Review MR with **Explain**. A ticket whose MR resolves gets an _Explain_ button in Detail's ACTIONS rail. Running it opens a new **third surface** in the nav rail — `/explain` — whose left-aligned sub-tabs are one per merge request under review, and selects the tab for that MR.

Behind the tab, clashboard checks the MR's head commit out into a throwaway detached git worktree and runs a read-only headless Claude agent in it. The agent's activity streams into the tab live while it works. It finishes by returning a **typed block report** — verdict, systems touched, narrative, mermaid diagrams, architect-altitude findings with syntax-highlighted diffs, a blast-radius table, open questions, and an explicit list of what it could not verify — which clashboard validates, persists, and renders in the app's own theme.

Closing a tab deletes the report, aborts any running agent, and removes the worktree.

The design decisions and their rejected alternatives are recorded in **[ADR-0009](../../docs/adr/0009-explain-surface-and-long-running-agent-runs.md)**; this PRD is the implementation plan.

---

## User Stories

1. As an architect, I want an **Explain** button on any ticket with an MR, so that a review starts from one click in the place I already read the ticket.
2. As an architect, I want Explain to open a dedicated surface rather than a modal, so that a review I am halfway through survives me going back to the board.
3. As an architect, I want one tab per merge request, so that I can hold several reviews open and switch between them.
4. As an architect, I want the tab set to survive a page reload and a dev-server restart, so that a ten-minute agent run is never lost to a refresh.
5. As an architect, I want to see what the agent is doing while it works — which files it reads, which history it walks — so that a multi-minute wait is not a black box.
6. As an architect, I want the report to open with a **verdict** and the **systems touched**, so that I know within seconds whether this MR needs my attention.
7. As an architect, I want a **blast-radius** view — what breaks, and who is downstream, if this is wrong — because that is the question a diff cannot answer.
8. As an architect, I want **diagrams** when the change is structural, so that a new call path or a changed dependency direction is something I see rather than something I reconstruct.
9. As an architect, I want findings to carry the **system** they concern and **why it matters**, not line-level nits, so that the report stays at the altitude I review at.
10. As an architect, I want each finding to show the **relevant diff hunk** with syntax highlighting in the app's Catppuccin theme, so that I can check the claim without leaving the report.
11. As an architect, I want the agent to tell me **what it could not verify**, so that I never mistake an unchecked assumption for a checked one.
12. As an architect, I want the agent to list **open questions** for the author, so that the report is something I can act on in the MR thread.
13. As an architect, I want the report to name the **commit it describes**, and to warn me when the MR has moved on since, so that I never review a stale tree without knowing it.
14. As an architect, I want a **Re-run** on a tab, so that I can refresh a report after the author pushes.
15. As an architect, I want closing a tab to **remove the worktree**, so that reviews do not silently accumulate checkouts on my disk.
16. As an architect, I want a **confirmation** before a close that throws away a finished report, so that a mis-clicked X does not cost me another agent run.
17. As an architect, I want Explain reachable from the command palette on the same key Review MR used, so that my existing muscle memory keeps working.
18. As a developer of this app, I want the agent to be **incapable of writing anything** — not a file, not the note, not Jira, not the MR — so that containment is structural rather than a promise.
19. As a developer of this app, I want the explain worktree to live in **its own root**, so that discarding it can never touch the worktree I am working in.

---

## Implementation Decisions

### Surfaces and routing

- `routes/-app-chrome.tsx` — **new.** The chrome extracted from `AppShell`: logo corner, header slot, `NavRail`, palette host. `AppShell` and the new `ExplainShell` both compose it.
- `routes/-nav/NavRail.tsx` — a third item, `/explain`, icon `ScanSearch`, testid `nav-explain`. `aria-label` becomes `"Surfaces"`.
- `routes/-header/Header.tsx` — takes the **new** `ShellVariant = 'main' | 'watchlist' | 'explain'` instead of `BoardVariant`, and its four board props (`filter`, `onClearFilter`, `onlyWorkspace`, `onToggleOnlyWorkspace`) become optional — absent on `'explain'`, which shows only refresh and the tag manager. `BoardVariant` stays exactly as it is and keeps its one job: which board `AppShell` renders (ADR-0009 §1).
- `routes/explain.tsx` — **new** file route. Search schema `{ mr?: number }`, validated the way `validateBoardSearch` validates `issue`. Renders `ExplainShell`.
- `routes/-explain/ExplainShell.tsx` — **new.** `AppChrome` + `contexts/explain`'s `ExplainTabs` and `ExplainReportPane`.

### The new bounded context: `src/contexts/explain/`

```
domain/        block-altitude.ts (severity ordering, group-by-system), stale-commits.ts
view-model/    explain-view-model.ts   # tab set + per-run phase machine, exhaustive over event x phase
presenter/     use-explain-runs.ts     # SSE subscription + the RPC calls
               use-explain-tabs.ts     # tab set from listExplainRuns + navigate
view/          ExplainTabs.tsx, ExplainTab.tsx, ExplainEmpty.tsx,
               ExplainActivityLog.tsx, ExplainReportPane.tsx,
               blocks/{VerdictBlock,SystemsBlock,NarrativeBlock,DiagramBlock,
                       FindingBlock,BlastRadiusBlock,QuestionsBlock,UnverifiedBlock}.tsx,
               CloseTabDialog.tsx
```

Per-run phases: `preparing | running | report | failed | interrupted`. `renderBlock` matches the block union with `ts-pattern.exhaustive()`, so a new block type is a compile error until it has a renderer.

Three new dependency-cruiser rules mirroring every other context: `explain-domain-only-imports-kernel`, `explain-application-only-imports-kernel-and-self`, `explain-view-model-only-imports-kernel-and-domain`. There is **no context-local application service** — as in `bulk-refine`, both halves are coordinator hooks over server functions.

### Server

- `server/lib/explain-worktree.ts` — **new.** `explainWorktreePath(iid, homeDir)`, `runPrepareExplainWorktree` (fetch the MR ref, `git worktree add --detach <path> <sha>`), `runDiscardExplainWorktree`. The worktree half of `open-workspace.ts` is **extracted** into a shared helper rather than copied; `runOpenInWorkspace`'s behaviour is unchanged and its existing tests must stay green untouched.
- `server/lib/explain-report.ts` — **new.** The Zod schema for `{ version, blocks }`, the `Block` discriminated union, and `parseExplainReport(runResult)` returning a tagged result. `finding` requires `system` and `whyItMatters`; severity is `high | medium | low` with no `nit`.
- `server/lib/explain-agent.ts` — **new.** `explainClaudeArgs(skillBody)` (allowlist / deny list / `dontAsk` / `--strict-mcp-config` / `stream-json`), `buildExplainPrompt(input)`, and `activityFor(streamEvent)` — the translation of one stream-json event into one activity line.
- `server/lib/explain-runs.ts` — **new.** The process-scoped run registry: `startRun`, `getRun`, `listRuns`, `subscribe`, `abortRun`, `closeRun`. Plain DI module with an injected runner, clock, and store, per ADR-0009 §4.
- `server/lib/explain-store.ts` — **new.** `~/.clashboard/explain/mr-<iid>.json`, mirroring `notes-store.ts`'s shape (injected fs deps, missing-file reads as absent, path guarded).
- `server/lib/claude-cli.ts` — **changed.** `spawnClaude` gains optional `cwd` and `timeoutMs`; a new `streamClaude` emits parsed stream-json lines to a callback. Existing signature and default timeout unchanged.
- `server/server-functions/explain.ts` — **new.** `startExplain` (resolves the MR head SHA via `GitlabGateway.getMr`, prepares the worktree, starts the run), `getExplainRun`, `listExplainRuns`, `closeExplain`.
- `src/routes/api/explain.$runId.stream.ts` — **new.** SSE. `404` on an unknown run id, `200` `text/event-stream` otherwise; each message is one activity line or a phase change, and the terminal message carries the report or the failure.
- `server/server-functions/detail.ts` — **changed.** `reviewMr` deleted.
- `.claude/skills/explain-mr/SKILL.md` — **new.** The architect-review philosophy and the output contract, loaded per run via `loadSkillBody` from `process.cwd()/.claude/skills/...`, matching `ask.ts` and `refine.ts`.

### Agent inputs

Everything the agent is given as text on stdin, alongside the worktree it may read: the MR title, description, source and target branch, head SHA, and discussion threads (from the GitLab gateway, system notes filtered out); the Jira ticket's summary, description, comments, and local note (the same loaders Refine and Ask already use); and the diff range it should treat as "the change" — `origin/<targetBranch>...<headSha>`, taken from the MR rather than assumed to be `develop`, since not every MR targets it. Slice 1's prepare step fetches that target ref alongside the head SHA for the same reason.

### Client plumbing

- `kernel/explain.ts` — re-exports the `Block` union and the server-function result types, per the kernel rule that contexts never import `~/server/...` directly.
- `coordinator/hooks.ts` — `useExplainRuns`, `useStartExplain`, `useCloseExplain`.
- `kernel/commands.ts` — `review-mr` renamed `explain-mr`; letter `v` kept; label "Explain MR"; group moves from `links` to `workflow`.
- `design-system/code-highlight.ts` — the shiki highlighter singleton and language-loader map extracted from `contexts/detail/view/adf/nodes/HighlightedCode.tsx` (adopt-on-second-use), plus a unified-diff renderer used by `FindingBlock`.
- `mermaid` added as a dependency, dynamically imported by `DiagramBlock` only.

### Deletions

`contexts/detail/view/ReviewMrButton.tsx`, the `reviewMr` server function and its result type, the `review-mr` action kind, its testid, and its e2e coverage. `~/.workflow/review-mr` is left on disk — not this repo's file — with nothing calling it.

---

## Slice Plan

Each slice is independently committable and leaves the app working. Verification is the gate, in the project's pre-push order (`pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test`) — noting that `check:arch` is advisory and already fails on master.

| #   | Slice                                                                                                                                                                                                                       | Verify                                                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Worktree half extracted.** `explain-worktree.ts` + the shared helper factored out of `open-workspace.ts`.                                                                                                                 | New unit tests table-driven over exists/missing x success/failure; **`open-workspace.test.ts` green with no edits** — the proof the extraction preserved behaviour.                                                              |
| 2   | **Report contract.** `explain-report.ts` (Zod schema, `Block` union, parser) + `kernel/explain.ts`.                                                                                                                         | Unit tests: every block type, unknown block type, `finding` missing `system`, truncated reply, prose wrapped around the JSON. `pnpm typecheck`.                                                                                  |
| 3   | **The agent.** `.claude/skills/explain-mr/SKILL.md`, `explain-agent.ts`, `claude-cli.ts` gaining `cwd` / `timeoutMs` / `streamClaude`.                                                                                      | Unit tests with a fake runner over recorded stream-json: argv carries the allowlist and deny list, `cwd` is the worktree, each event kind maps to its activity line. One manual run against a real MR, output inspected by hand. |
| 4   | **Run registry, RPC, SSE.** `explain-runs.ts`, `explain-store.ts`, `server-functions/explain.ts`, `routes/api/explain.$runId.stream.ts`.                                                                                    | Registry unit tests (phase sequence, fan-out, the 2-run bound, abort, interrupted-on-restart). Route handler unit test per ADR-0006's precedent. `curl -N` the endpoint against a live run.                                      |
| 5   | **The surface, activity only.** `AppChrome` extraction, third `NavRail` item, `Header` variant, `/explain` route, `ExplainShell`, the view-model, tab strip, and live activity log. Report shown as raw JSON.               | View-model unit tests exhaustive over event x phase. `pnpm depcruise` (the three new rules). Run the app: start a run from a URL, watch it stream, reload mid-run and see it resume.                                             |
| 6   | **Block renderers.** All eight blocks + the extracted shiki highlighter and diff renderer.                                                                                                                                  | Vitest snapshots over one fixture report containing every block type, the `RenderAdf.test.tsx.snap` pattern. Run the app against a real report.                                                                                  |
| 7   | **Diagrams.** `mermaid` dependency, lazy `DiagramBlock`, Catppuccin theme variables, `securityLevel: 'strict'`.                                                                                                             | Fixture report with a diagram renders; bundle check that mermaid is absent from the initial chunk.                                                                                                                               |
| 8   | **Hand-offs and the removal.** `ExplainMrButton` in Detail's ACTIONS rail, palette `review-mr` to `explain-mr`, `ReviewMrButton` / `reviewMr` deleted, close-tab confirmation + discard, Re-run, the stale-commits warning. | Full pre-push gate. Run the app: Explain from Detail, Explain from the palette on `v`, close and confirm the worktree is gone.                                                                                                   |
| 9   | **Docs and e2e.** `contexts/explain/CONTEXT.md`, CONTEXT-MAP rows, README context list and folder layout, `docs/keyboard.md`, `pnpm docs:arch`, e2e specs with a `CLASHBOARD_CLAUDE_BIN` stub emitting canned stream-json.  | `pnpm test:e2e`.                                                                                                                                                                                                                 |

### Known scope boundaries

- **No install, build, typecheck, or test in the worktree** (ADR-0009 §6). The report says what it could not verify. An opt-in deep-verify pass is a later prepare-phase change.
- **The registry is in-memory.** A dev-server restart loses a run in flight (the tab reads "interrupted — re-run") and never a finished report.
- **`dr-web` only**, like every other worktree path in the app.
- **No `CLASHBOARD_HOME` override.** Renderers are covered by snapshots over a fixture rather than an e2e that writes to the real home directory. Adding the override would benefit every local store and is deliberately out of scope here.

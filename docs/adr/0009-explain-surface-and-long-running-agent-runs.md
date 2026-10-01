# Explain: a non-board nav-rail surface, and long-running agent runs

clashboard replaces **Review MR** with **Explain**. A ticket whose MR resolves gets an _Explain_ action; running it opens a **third nav-rail surface** (`/explain`) whose left-aligned sub-tabs are one-per-merge-request. Each tab is an **explain run**: a headless Claude agent working inside a throwaway, detached git worktree of the MR's head commit, reporting progress to the tab over **server-sent events**, and finishing with a **typed block report** persisted under `~/.clashboard/explain/`. Closing a tab discards the report, aborts the run, and removes the worktree.

The proximate driver is product: the user reviews as an architect, and the questions that decide an architectural review — which systems does this touch, how does it change them, what is the blast radius, does it fit — are not answerable from a diff viewer. Review MR was a one-line cmux spawn into `lumen diff --mr N`; it answered none of them. The ultimate driver is that clashboard already owns all three ingredients — git worktrees and cmux (`server/lib/open-workspace.ts`), headless Claude (`server/lib/claude-cli.ts`), and the GitLab gateway — and Review MR used exactly one of them. The team-template lesson is **what an agent-backed feature looks like when the agent's output is a typed domain object rather than a blob of prose**: the schema is the contract, matched exhaustively, and the altitude of the review is enforced by what the schema can express.

## Considered options

### 1. A third nav-rail surface that is not a board

ADR-0007 chose a plain shared `AppShell` over a pathless layout route and left the upgrade path open "if a third board arrives". A third _surface_ arrives now, and it is **not** a board: no columns, no card grid, no detail panel, no text filter.

- **(a) A third `BoardVariant` on `AppShell`.** _Rejected:_ the name would lie, and the props do not fit — `searchQuery`, `onlyWorkspace`, `issue`, `notes`, `ai` are all meaningless on Explain. Every one becomes optional and every board-only branch grows a dead `explain` arm. `AppShell`'s job is "pick a board"; Explain is not a board to pick.

- **(b) A pathless layout route owning the chrome.** _Rejected, again and for the same reason:_ still more router indirection than the problem needs. The upgrade path stays open, and a fourth surface is the trigger to take it.

- **(c) Extract the chrome; give Explain its own shell.** _Selected._ The chrome — the logo corner, the header slot, `NavRail`, and the palette host — moves out of `AppShell` into `routes/-app-chrome.tsx`. `AppShell` composes it with the board + detail panel; a new `ExplainShell` composes it with the tab strip + report pane. `BoardVariant` stays `'main' | 'watchlist'`.

Consequence: the rail's `aria-label` changes from `"Boards"` to `"Surfaces"`, and the header on `/explain` carries only the global tools (refresh, tag manager) — not New, not the filter chip, not Only Workspace, not Configure lanes.

That is the existing variant-aware `Header`, not a second header component — but reaching it needs one correction to ADR-0007's vocabulary. `Header` today takes `variant: BoardVariant` plus four **required** board props (`filter`, `onClearFilter`, `onlyWorkspace`, `onToggleOnlyWorkspace`), none of which exist on Explain. So a new `ShellVariant = 'main' | 'watchlist' | 'explain'` names what the header actually serves — a surface — and the four board props become optional, absent on `'explain'`. `BoardVariant` survives unchanged as what it always meant: which board `AppShell` renders. The two types are deliberately distinct rather than one widened enum, because "which surface has chrome" and "which board is on screen" stopped being the same question the moment a surface stopped being a board.

### 2. Tab identity is the merge request, and the open set lives on disk

- **Keyed by MR iid, not issue key.** The merge request is the reviewable unit. A ticket accumulates more than one MR over its life, and review cards arrive as MRs in the first place — `resolveMrForWorkItem` already returns an MR, so keying on the ticket would throw away the identity we have.
- **`/explain` lists; `/explain?mr=123` selects.** ADR-0007's rule — a surface the URL can name and the back button can return to — applies unchanged to a tab.
- **The open tab set is derived from `~/.clashboard/explain/`, not from client state.** _Rejected alternative:_ tabs in React state. A ten-minute agent run behind a tab lost to a reload is unrecoverable, and the persisted report is the natural source of truth for "which tabs are open" once close deletes it.

### 3. Detail hands off through the URL, not through an import

`ExplainMrButton` sits in Detail's ACTIONS rail (where `ReviewMrButton` sat) and **navigates** to `/explain?mr=<iid>`. The Explain surface starts a run on arrival when that MR has no report yet.

Detail therefore never imports `contexts/explain`: the no-cross-context law holds with no coordinator workflow and no `Commands` bus entry. This is the palette's `?ai=` hand-off (ADR-0007) one level up — there the target was a modal inside the panel, here it is a whole surface, and the mechanism is the same URL.

The palette's `review-mr` action kind is **renamed** `explain-mr` and keeps its letter `v`. Legality is unchanged (`resolveMrForWorkItem(item) !== null`), so `action-legality.ts` takes a rename, not new logic. Keeping `v` is deliberate: it was arbitrary for "review" too, and Explain _is_ the review action, so muscle memory carries over rather than being invalidated.

### 4. The run is a server-side job with an SSE progress channel

- **(a) One long `createServerFn` call, spinner until it resolves** — how Refine and Ask work today. _Rejected:_ `claude-cli.ts` caps at three minutes and an architect-grade review overruns it; a ten-minute HTTP request survives no reload; and the run is a black box for its whole duration, which is the worst property a ten-minute wait can have.

- **(b) A run record the client polls.** _Rejected:_ fits the existing shape with no new layer, but buys only a phase label. The thing that makes a long agent run tolerable is watching it work.

- **(c) A run registry plus an SSE route.** _Selected._
  - `server/lib/explain-runs.ts` — a process-scoped `runId → { phase, activity[], report? }` map with subscribers. A **plain dependency-injected module, not an Effect service**, for the reason `notes-store.ts` states for local file I/O: this is local process state with no external system, and injected deps make it unit-testable with a fake. Upgrade path: swap the map for a store.
  - Start / read / close are `server-functions/explain.ts` — ordinary ADR-0005 JSON-RPC.
  - Progress is `src/routes/api/explain.$runId.stream.ts` — an SSE endpoint. ADR-0006 names "server-sent events" as belonging to that layer; this is the second endpoint it predicted, and the first one that is not a binary stream.
  - The agent runs `--output-format stream-json --verbose`. The registry **translates** each event into a coarse activity line (`Reading src/pricing/quote.ts`, `git log -- src/pricing`) plus a phase; raw stream-json never reaches the browser. The translation is the contract, so a CLI output-format change breaks exactly one module.
  - **Concurrency is bounded to two** simultaneous runs; further starts queue. The run is heavy and the machine is also the user's.
  - **Timeout is 20 minutes**, via a new per-call override on `claude-cli.ts` rather than raising its shared 3-minute default.

Errors keep the project's two shapes honestly: the RPC calls return tagged `{ ok: false }` (ADR-0004), the SSE route maps failures to HTTP status codes (ADR-0006), and a failed _agent_ is neither — it is a terminal `phase: 'failed'` with a message, delivered on the stream and stored on the run.

### 5. The worktree is explain-only, detached, and keyed by the MR

`~/projects/worktrees/dr-web-explain/mr-<iid>`, created with `git worktree add --detach <path> <mrHeadSha>`. No cmux workspace, no branch created, no `node_modules`.

- **Detached at the MR's head SHA** is what makes a report reproducible and what lets a tab say "3 new commits since this report" instead of silently describing an older tree.
- **A separate root** is what makes "close discards the worktree" safe: it can never reach `~/projects/worktrees/dr-web/<KEY>`, where the user's own work in progress lives.
- _Rejected — reuse the per-ticket worktree:_ one checkout instead of two, but close-discards would risk deleting work in progress, and the agent would review a dirty tree rather than the MR as submitted.
- _Rejected — a temp clone:_ throws away the shared `.git` that makes `git worktree` cheap.

This requires factoring `server/lib/open-workspace.ts`, where `ensureWorktree` is only ever reached through `runOpenInWorkspace` and is therefore always paired with `selectOrCreateWorkspace`. The worktree half is extracted so Explain can use it alone. `runOpenInWorkspace`'s behaviour is unchanged.

### 6. The agent is read-only and cannot install or build

The `ask-ticket.ts` posture — `--permission-mode dontAsk`, `--strict-mcp-config`, an explicit read-only allowlist and a belt-and-suspenders deny list — widened to filesystem reads and scoped by `cwd` to the worktree:

- **Allowed:** `Read`, `Grep`, `Glob`, `Bash(git log|blame|diff|show|rev-parse ...)`, `Bash(glab mr view ...)`, `Bash(acli jira workitem view ...)`, `WebFetch`, `WebSearch`.
- **Denied:** `Write`, `Edit`, `MultiEdit`, `NotebookEdit`, and every mutating `git` / `glab` / `acli` subcommand named explicitly.

**No `pnpm i`, no build, no typecheck, no tests.** A fresh worktree has no `node_modules`, and installing would cost minutes of dead time per tab and gigabytes per open tab. The consequence is made explicit rather than hidden: the report schema carries an `unverified` block, and the agent is instructed to state what it could not check instead of implying it ran anything. Adding an opt-in deep-verify pass later is a prepare-phase change, not a rework.

Nothing is written by the agent at all: the report comes back on stdout and clashboard persists it. That containment is the design, not a convention the agent is trusted to follow — the same sentence ADR-adjacent `refine-note.ts` already earns.

### 7. The report is a typed block document

The agent returns `{ version: 1, blocks: Block[] }`, where `Block` is a discriminated union.

- **(a) A markdown report,** rendered through the react-markdown path Notes already uses. _Rejected:_ much less code, but the report becomes a wall of text — no per-finding collapse, no filtering by system or severity, no structured navigation, and "Findings" degrades into prose with fenced blocks in it.
- **(b) A typed block document.** _Selected._ Matched in the view with `ts-pattern.exhaustive()`, so **adding a block type is a compile error until it has a renderer** — the invariant ADF rendering already relies on. Validated with **Zod at the server boundary, once**, before persisting; a malformed report becomes a tagged error that keeps the raw text for debugging rather than a half-rendered tab.

Block types (v1): `verdict`, `systems`, `narrative`, `diagram`, `finding`, `blast-radius`, `questions`, `unverified`.

The schema is **architect-altitude by construction**. There is no `nit` severity to select, and a `finding` cannot be expressed without naming the `system` it concerns and a `whyItMatters`. A schema that cannot represent a line-length complaint is a cheaper and more durable instruction than a prompt asking the agent not to make one.

### 8. Diffs and diagrams

- **Diffs:** shiki with `catppuccin-mocha`, which is already wired, already lazy per-language, and already the app's code theme. `HighlightedCode.tsx`'s highlighter singleton and language-loader map are **extracted** into `design-system/` for reuse rather than copied — the file is currently Detail-private, and a second consumer is the point at which the adopt-on-second-use rule applies.
- **Diagrams:** `mermaid`, `import()`-ed per diagram block and themed to Catppuccin Mocha through `initialize({ themeVariables })`. Lazy loading keeps a large dependency off the main bundle exactly as the shiki language loaders do, so a report without a diagram pays nothing. _Rejected — agent-emitted SVG:_ no new dependency, but layout quality is entirely the model's and untrusted SVG needs real sanitising. _Rejected — a native node/edge block we lay out ourselves:_ perfectly on-theme and fully typed, but it is a layout engine to write and only covers box-and-arrow graphs.
  Diagram source is untrusted agent output, so mermaid runs with `securityLevel: 'strict'`.

### 9. Close discards everything

Closing a tab deletes `~/.clashboard/explain/mr-<iid>.json`, aborts a running agent, and removes the worktree with the detached, unref'd background pattern `removeWorktreeInBackground` already establishes. A confirmation dialog guards it whenever a report exists or a run is in flight, because re-running costs minutes — the same reasoning that puts Discard Workspace behind a confirmation even from the palette.

## Consequences

- **Review MR goes away entirely:** `contexts/detail/view/ReviewMrButton.tsx`, the `reviewMr` server function, the `review-mr` action kind, its testid, and its e2e coverage. `~/.workflow/review-mr` stays on disk — it is not this repo's file — but nothing calls it.
- **A new bounded context,** `src/contexts/explain/`, with the usual hexagon and three new dependency-cruiser rules mirroring every other context (`explain-domain-only-imports-kernel`, `explain-application-only-imports-kernel-and-self`, `explain-view-model-only-imports-kernel-and-domain`).
- **The first long-running background job in the app.** The registry is in-memory, so a dev-server restart loses a **running** run — the tab reads "interrupted — re-run" — and never a **finished** one, which is on disk.
- **`claude-cli.ts` grows two capabilities** every future agent feature will want: a `cwd` and a per-call timeout, plus a streaming runner beside `spawnClaude`. The existing `spawnClaude` signature is unchanged.
- **`src/routes/api/` gains its second endpoint**, and with it the first non-binary member of the layer — which is what makes ADR-0006's "when to use this layer" list read as a list rather than a description of one file.

## Tests

| Layer                                           | How                                                                                                                                                                                                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `explain-worktree` (create/remove at a SHA)     | Pure unit, fake `spawn` / `exists`, table-driven over the exists/missing and success/failure matrix. `open-workspace`'s existing tests must stay green unchanged — that is the proof the extraction was behaviour-preserving.                  |
| Report schema (`parseExplainReport`)            | Pure unit, table-driven: each block type, an unknown block type, a `finding` missing `system`, a truncated reply, prose around the JSON.                                                                                                       |
| Agent module (args, prompt, stream translation) | Pure unit with a fake `RunClaude` over recorded `stream-json` lines. Asserts the allowlist and deny list are on the argv, `cwd` is the worktree, and each event kind maps to the expected activity line.                                       |
| Run registry                                    | Unit with a fake runner and fake clock: phase sequence, subscriber fan-out, the 2-run concurrency bound, abort, and the interrupted-on-restart read.                                                                                           |
| SSE route handler                               | Unit, per ADR-0006's precedent: given a registry with a known run, assert the `Response` content type, the event framing, and the 404 for an unknown run id.                                                                                   |
| View-model (tab set + per-run machine)          | Pure call/assert, exhaustive over event × phase (ADR-0003).                                                                                                                                                                                    |
| Block renderers                                 | Vitest snapshots over one fixture report containing every block type — the pattern `RenderAdf.test.tsx.snap` already establishes.                                                                                                              |
| End-to-end                                      | Per ADR-0001, with `CLASHBOARD_CLAUDE_BIN` pointed at a stub that emits canned `stream-json`: the Detail hand-off opens the surface and selects the tab, the activity log streams, the report renders, and close prompts then removes the tab. |

A full e2e that asserts a _persisted_ report would need to write to `~/.clashboard/`; rather than touch the real home directory, the renderers are covered by snapshot tests over a fixture. Introducing a `CLASHBOARD_HOME` override — which every local store would benefit from — is deliberately left out of this ADR's scope.

## References

- ADR-0001 — mock at the network boundary; the agent is a subprocess rather than a network call, hence the `CLASHBOARD_CLAUDE_BIN` stub.
- ADR-0003 — framework-free view-models; the tab set and per-run machine follow it.
- ADR-0004 — neverthrow / Effect; the RPC calls keep the tagged-error wire shape.
- ADR-0005 — Effect server architecture; `server-functions/explain.ts` sits inside its boundary, the registry deliberately outside it.
- ADR-0006 — binary-stream API routes; the SSE endpoint is the "server-sent events" case that ADR named.
- ADR-0007 — multi-board app shell; the chrome extraction is the promised upgrade, taken for a surface rather than a board.
- ADR-0008 — command-palette action catalogue; `review-mr` becomes `explain-mr`, keeping its letter.

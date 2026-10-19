# Gantt charts: a surface clashboard writes to, and an API an agent drives

clashboard grows a **fourth nav-rail surface** — `/gantt` — showing one or more **Gantt charts**: a recursive tree of lanes over a time axis, with `blocks` / `blocked-by` arrows between them, each lane able to carry a markdown body. A chart's nodes come from two places at once: **mirrored Jira tickets**, discovered from one or more epics and kept in step by a non-destructive sync; and **agent-authored PRDs and issues**, for which the chart is the only copy. Agents maintain charts through a **documented REST API**, and a button copies the SKILL that teaches it.

The proximate driver is product: a multi-PRD project has no surface in clashboard at all. The board answers "what am I working on today" and the watchlist answers "what am I advising on"; neither answers "where is this programme of work, and what is waiting on what". The ultimate driver is that **the plan is the artifact several agents need to share**. Agents already write PRDs and issues into repositories, where they are invisible to each other, invisible to the user, and impossible to see the shape of. Putting the plan behind an HTTP API that one process owns makes it a thing agents coordinate through rather than a pile of files each of them has a private opinion about.

The team-template lesson is **what it costs to let an application become the system of record for something** — and that the cost is payable in named parts: validation at the boundary, one writer, serialised writes, an audit trail, and a destructive verb kept away from the machine.

## Considered options

### 1. A chart is a system of record, and the exception is scoped

`CONTEXT-MAP.md` opens with "clashboard is a viewer, not a system of record", and every store under `~/.clashboard/` has honoured it. Notes and tags are **annotations on** Jira tickets. The watchlist is a **curated list of keys**. An explain report is a **derived artifact that close() deletes**. Nothing in `~/.clashboard/` has ever been the only copy of anything.

An agent-authored chart breaks that. Its PRD bodies exist nowhere else.

- **(a) Charts project files the agent owns in the repository.** Source-2 PRDs stay as markdown in `dr-web`; clashboard indexes and renders them, and the viewer claim survives untouched. _Rejected:_ it gives up the property the feature exists for. Agents in separate worktrees write to separate checkouts of the same paths and conflict; "where is this project" needs a filesystem scan of somewhere the dashboard has no business reading; and nothing arbitrates two agents' simultaneous opinions about one PRD.

- **(b) Jira-sourced charts only, agent-authored charts deferred.** No ontology change at all — a chart is a projection of an epic and nothing more. _Rejected:_ the multi-PRD visibility is the stated goal, and deferring it defers the whole point while still paying for the surface.

- **(c) Accept the exception and scope it.** _Selected._ A chart is authoritative for what it owns. The claim in CONTEXT-MAP is amended rather than abandoned: **clashboard is a viewer of other systems' records and the system of record for the plan that spans them.** The exception is paid for in §7, §8 and §11 — nothing here is free.

Consequence: this ADR is the only place in the codebase where a write path owes durability, and the sections that pay for it are load-bearing rather than defensive.

### 2. A fourth surface, and ADR-0007's layout-route trigger declined again

ADR-0007 rejected a pathless layout route and left the upgrade path open "if a third board arrives". ADR-0009 §1(b) rejected it again and named the trigger precisely: "**a fourth surface is the trigger to take it**". Gantt is the fourth surface. The trigger has fired, and we looked.

- **(a) Take the pathless layout route, as promised.** _Rejected, with the reason recorded so the question stops recurring on these grounds:_ **the win it would have delivered was already taken.** ADR-0009 extracted the chrome into `routes/-app-chrome.tsx`; a layout route would now own only what `AppChrome` already owns. What is left per-surface is _state_: `AppShell` holds `searchQuery` and `onlyWorkspace` in `useState` and feeds both the header and the palette host. A layout route rendering `AppChrome` + `<Outlet/>` cannot read its child's state, so those four controls would have to be hoisted into router context or a provider — and `/explain` and `/gantt`, which have no board to control, would carry them. That is more indirection for the surfaces that need it least.

- **(b) A layout route over the two boards only.** _Rejected:_ it groups exactly the routes that do share state, and makes the route tree inconsistent in a way that is harder to explain than either pure option.

- **(c) A fourth standalone shell.** _Selected._ `routes/gantt.tsx` delegates to `routes/-gantt-shell.tsx`, as the other three routes delegate. `ShellVariant` gains `'gantt'`; `BoardVariant` is untouched for the third time.

**The trigger is re-aimed, not removed.** The thing that should force the layout route is not a count of surfaces but **a surface that needs chrome state another surface also needs** — the condition under which hoisting stops being a cost and starts being the point.

### 3. Source is a property of a node — and really of a field

- **(a) Source on the chart.** A chart is either Jira-backed or agent-authored. _Rejected:_ it forbids the arrangement the feature is for — existing tickets grouped under an agent-written PRD lane, with an arrow from one to the other. And "a chart whose nodes are all Jira-backed" is a strict subset of the per-node model, so choosing the chart-level discriminator buys simplicity now at the cost of a store migration later.

- **(b) Two chart types sharing a renderer.** _Rejected:_ two schemas, two stores, two API namespaces and two SKILLs for one surface.

- **(c) Source on the node.** _Selected._ `source: { kind: 'jira', key } | { kind: 'local' }`, matched with `ts-pattern`.

The sharper statement, which §4 forces: **source names who owns which _field_, not who owns the node.** A jira node's `title`, `column` and `assignee` are **mirrored** — sync overwrites them and the UI never offers to edit them. Its `start`, `end`, `parent`, `edges` and `body` are **owned by the chart** and sync never touches them. A node is therefore not "from Jira" or "local"; it has a mirrored half and an owned half, and every rule in this ADR is stated against one half or the other.

### 4. Time is chart-owned; progress is kernel `Column`; blocked is derived

`BOARD_FIELDS` is `['summary', 'status', 'labels', 'issuetype', 'parent']` and the raw Jira types carry only `created`. clashboard knows **no Jira dates at all**, and in practice a team's tickets have neither `duedate` nor the Advanced-Roadmaps start field populated.

- **(a) Read Jira dates, fall back to local.** _Rejected:_ needs a custom-field id discovered per tenant, handles mostly-empty values, and creates a two-writer problem on the one field the chart exists to show.
- **(b) Derive the axis from dependency order and size estimates — a logical Gantt with no calendar.** _Rejected for now:_ "where is this project" wants a date, and a cycle (§6) would become a layout failure rather than a warning. Noted as the upgrade path if hand-set dates rot.
- **(c) Spans from observed status history.** _Rejected:_ answers where the time went, not where the project is going, and costs a changelog expand per issue.
- **(d) `start` / `end` are chart-owned on every node, nullable, never read from Jira and never written back.** _Selected._

Two consequences that are not obvious:

- **Every node carries its own span, parents included, and the children's span is drawn as a derived underlay.** A purely rolled-up parent cannot express "this PRD is Q4" before it has been decomposed, which is the order planning actually happens in — and a freshly-created PRD would have no bar at all. Drawing both makes **slip visible**: a PRD whose features have overrun its declared window shows the overrun instead of silently absorbing it. The underlay is computed from **dated** descendants only.
- **Dates are nullable because import makes them so.** §5 bootstraps a chart with one node per discovered ticket and no dates; an undated node renders in the tree, dimmed, with no bar. Required dates would mean either fabricating a plan nobody made or making the agent supply forty of them before the chart exists.

**Progress is the kernel `Column`** — `TO DO | In Implementation | In Code Review | Done` — derived for a jira node via `columnForStatus(status)` and declared for a local one. Reusing the board's vocabulary is deliberate: it is already case-insensitive over HDR's mixed-casing statuses, and a second progress vocabulary would be a second answer to one question. A **percent** was rejected: a number an agent invents and never revises, with no honest Jira equivalent, rendered as a confident partial bar.

`Column` costs one thing here, and it is paid back: `COLUMN_TO_STATUSES` folds `'Blocked'` into `'TO DO'`, erasing the one state a dependency chart is about. So **`blocked` is derived from the edge graph and never stored** — a node is blocked when a node pointing at it through a `blocks` edge is not `Done`, and `unresolvable` when it sits in a cycle. Derived rather than stored means it cannot go stale when the blocker ships, and it makes the arrows load-bearing rather than decorative.

A parent summarises its descendants as a **distribution, not a state**: a segmented bar plus "7 of 11 done". Any single rolled-up state hides the answer the chart was opened for.

### 5. Sync is a verb, and it is strictly non-destructive

Jira's parent/child and the chart's tree will disagree, because the arrangement the feature is for — tickets grouped under an agent-written PRD — is precisely a disagreement.

- **(a) Mirror Jira's hierarchy.** _Rejected:_ makes the headline arrangement impossible.
- **(b) Chart-owned placement, but sync auto-places new children and deletes departed ones.** _Rejected:_ a Jira-backed node carries local children, a body, declared edges and hand-set dates. Deleting it because its ticket left the epic destroys all of that, silently, in the background.
- **(c) Chart-owned placement; sync never moves and never deletes.** _Selected._

Sync **refreshes mirrored fields**, **adds** newly discovered keys, and **marks** departures `orphaned`. It never moves a node, never deletes one, and never touches a date. Jira's parent is used **once**, at import, as the initial placement; after that the chart owns the tree forever.

`jiraSources` is a **list of epic keys**, not a JQL string: the server builds `parent in (...)` itself with `assertIssueKey` over every key, so no unvalidatable query is ever stored and the SKILL teaches a string array rather than a query language. Arbitrary JQL is the upgrade path; `searchIssues(jql, fields)` already accepts it.

**Sync is `POST /charts/:id/sync`, not a side effect of a read.** The UI fires it when a chart whose `lastSyncedAt` is older than five minutes is opened, and on the header's Refresh; the SKILL tells agents to call it before reading if they want current Jira state. _Rejected — syncing inside `GET`:_ an agent doing a cheap id lookup would pay a Jira round-trip and silently mutate the chart it was only looking at. _Rejected — interval polling:_ a Jira search per open chart per tick, and a disk write on a timer, for data that changes a few times a day. clashboard's policy is stale-while-revalidate plus an explicit refresh (`DASHBOARD_STALE_TIMES`, no interval but `workspaces`), and sync follows it.

**The server bootstraps the import; the agent arranges it.** `POST /charts { jiraSources }` creates the chart and fills it with one mirrored node per discovered ticket — flat, undated, placed by Jira's parent. _Rejected — the agent creates every node:_ forty round-trips and a great deal of context for work the server can do in one call, and an agent that silently skips the tickets it did not notice. What is left for the agent is the part that needs judgement: grouping under PRD lanes, dating, declaring the edges Jira does not have, writing bodies. Import and sync are **one code path**, which is why there is no separate `import` verb to rot beside `sync`.

### 6. Edges carry their own source, and a cycle is reported rather than refused

Jira has this data — `load-issue.ts` already requests `issuelinks` and shapes inward/outward into `IssueLink` — and because `searchIssues` takes a fields array, a whole epic's links arrive in **one** call. But Jira's link hygiene is worse than its date hygiene: the dependency an architect knows about is frequently not linked at all.

So an edge carries its own `source`, exactly as a node does. A **jira** edge is mirrored and reconciled by sync. A **local** edge is chart-owned and sync never touches it — **including between two Jira tickets**, which is the common and important case. One reconciliation rule: a local edge whose endpoint pair later appears as a real Jira link is **promoted** to `jira`, not drawn twice.

_Rejected — ownership derived from endpoints_ (jira↔jira mirrored, anything else owned): one less field, and it makes the important case impossible.

**Cycles are always accepted and then surfaced.** The API never refuses to record a dependency someone declared; the layout function detects cycles, the chart names the loop in a warning, the cycle's edges render dashed, and every node in it is `blocked: 'unresolvable'`. _Rejected — 409 on a cycle-creating edge:_ it guarantees a DAG, but an agent building a chart incrementally can create a cycle it intended to resolve two calls later, and the API ends up refusing to record something the plan really contains. A plan that is impossible should **look** impossible; that is the most expensive thing a planning view can get wrong.

### 7. A third API consumer: REST beside RPC, over one application service

ADR-0005 owns the JSON-RPC boundary (`server-functions/`, `toWire`, tagged errors, consumed by typed client code). ADR-0006 owns the HTTP boundary (`routes/api/`, status codes, consumed by the browser as URL strings) and forbids itself for "anything where the response naturally serialises to JSON that the client unwraps via neverthrow".

An agent is neither consumer. It is an **external process, hitting a documented URL, with a JSON body, performing mutations**. TanStack Start does give a server function an HTTP URL, but it is framework-generated RPC-POST — not something that can be written into a SKILL and survive a dependency bump.

- **(a) Point the SKILL at the generated server-function URLs.** _Rejected:_ undocumented framework internals as a public contract.
- **(b) One shape — the UI talks REST too.** _Rejected:_ the client would give up `toWire` / neverthrow / exhaustive tagged errors for this feature, a visible exception to ADR-0004 in the repository whose job is to demonstrate ADR-0004.
- **(c) A local MCP server instead of REST.** _Rejected:_ every agent touching a chart would need it in its MCP config rather than a pasted SKILL, and this project already learned that headless MCP costs ~30s of startup and that headless OAuth does not persist (the Ask feature's spawn runs `--strict-mcp-config` with MCP off for exactly that reason).
- **(d) REST in `routes/api/` for agents, RPC for the UI, one application service under both.** _Selected._

This is the sentence ADR-0006 already wrote — "if the same Effect is needed in both shapes, it lives in `server/contexts/<name>/application/` and both call sites import from there" — and the edge it already permits. **ADR-0006 gains a third consumer arm:** _consumed by an external process as a documented URL contract._

### 8. One writer, node-level writes, slugs for ids, and no destructive verb in the API

The exception taken in §1 is paid for here.

- **Node-level CRUD, writes serialised per chart.** The store is one local process, so a per-chart write queue makes read-modify-write atomic for nothing. Two agents touching different nodes both simply succeed; there is no version token, no `If-Match`, and no retry loop for a SKILL to get wrong. _Rejected — whole-chart PUT with a version:_ one endpoint and a document shape an LLM handles well, but every concurrent edit becomes a conflict and a mishandled 409 either loses work or spins. _Rejected — whole-chart PUT, last writer wins:_ guaranteed silent loss the first time two agents overlap, which is the exact scenario the feature exists to support.

- **The UI is read-only, and the agent is the only writer.** Expand, collapse, zoom, filter, read bodies, sync, archive — nothing that mutates chart data. This keeps the write queue uncontended by a human mid-interaction and matches the premise: the agent maintains the plan, you read it. It also keeps the first slice small; direct manipulation is additive against an API that will already exist. **The unplaced tray is read-only too** — it is a visible to-do list ("3 new tickets arrived in GEO-120") and the agent, which can read a ticket to decide where it belongs, does the placing. That is what makes "one writer" true without an exception to explain.

- **Node ids are agent-supplied slugs**, `^[a-z0-9][a-z0-9-]{0,63}$`, unique within a chart, with a Jira node taking its lowercased key. _Rejected — server-generated opaque ids:_ collisions become impossible, but every agent turn must carry a map of ids it cannot reconstruct, a transposed id silently targets the wrong node, and `bodies/n_7f3a91.md` is not a file anyone can read. The slug charset is also the **path guard** §11's layout needs, in the shape `assertIssueKey` already establishes.

- **`DELETE /charts/:id` is deliberately not exposed.** Archiving a chart — moving its folder to `gantt/.archive/` — is a confirmed UI action. Single-writer is a rule about chart _content_; chart _lifecycle_ is a different question, and the irreversible verb over a system of record belongs with the human rather than with a process acting on paraphrased instructions.

### 9. Error bodies follow the consumer — ADR-0006 amended

ADR-0006 mandates "Plain-text bodies, not JSON", and gives a consumer-specific reason: "The browser's `<img onerror>` / `<video onerror>` does not inspect the body." That reasoning does not transfer. This consumer must **self-correct from the error**, and `explain-skill.test.ts` exists because the alternative is a rejected run: "the next run invented a key, and a 20-minute agent run was rejected at the boundary with `moves.1.blocks.1.mermaid: expected string, received undefined`."

So gantt's routes return **structured JSON** — `{ error, message, issues: [{ path, expected, received }] }`, mapped off the schema decode failure — while HTTP status still carries the category (`400` charset or schema, `404` unknown chart or node, `409` duplicate id, `503` Jira unreachable). ADR-0006 gains a sentence rather than an exception: **the body shape follows the consumer** — plain text for browsers, JSON for programmatic clients.

_Rejected — reusing the `toWire` envelope over REST:_ one failure vocabulary for the whole app, at the cost of marrying RPC envelope semantics to HTTP status semantics, which is the precise muddle ADR-0006 was written to prevent.

### 10. The chart is drawn by a pure layout function

`mermaid` is already a dependency and has a `gantt` type, but it renders a static picture with no dependency arrows, no collapse and no hit targets.

- **(a) A Gantt library** (frappe-gantt, wx-react-gantt). _Rejected:_ it owns layout and interaction state, so the recursive tree, the inline info band, read-only mode and the segmented progress bars each become a fight with its model — and the view-model degrades into an adapter to a library rather than being the logic.
- **(b) One SVG for everything.** _Rejected:_ markdown bands, expand affordances and wrapping text do not belong in SVG, so it arrives at (c) through `foreignObject`.
- **(c) CSS grid rows + absolutely positioned bars + one SVG arrow overlay.** _Selected._

All geometry comes from `layout(chart, zoom, collapsed, viewport) → { rows, bars, arrows, cycles }` in `view-model/`, with **no React import**. This is the strongest available evidence for ADR-0003's claim: a Gantt layout is pure, table-testable, and portable, and a library would take the demonstration away. The function is written to permit **row windowing** from the start — rows are produced from an explicit visible range rather than mapped over the whole tree — because a forty-node chart is fine and a three-hundred-node chart is not.

**Arrows re-anchor rather than disappear.** An arrow whose endpoint is collapsed out of view attaches to the nearest visible ancestor, and arrows collapsing onto the same pair merge with a count. Collapse then **summarises** dependencies instead of concealing them, and a fully collapsed chart becomes a PRD-level dependency graph — arguably the most useful view of all. An edge between two children of the same collapsed parent re-anchors to a self-loop and is **dropped**, because a self-arrow communicates nothing. _Rejected — hiding the arrow:_ collapsing a lane would silently destroy information, so the chart could only be trusted fully expanded, which defeats collapse.

Three fixed zoom levels — week, month, quarter — each with its own honest tick labels, defaulting to the coarsest that fits the chart's extent, with a today line. _Rejected — continuous zoom:_ the tick-density algorithm is the fiddliest code in any timeline and the hardest to make look deliberate at every scale.

**A lane's attached info is an inline band**, height-capped with an escape to a full-width panel, which is what "extends with the lane extension" describes and what keeps two PRDs comparable in one scroll context. A **side panel** was rejected for the body: it covers the right third of the time axis, which is the future, which is the part being looked at. The **ticket** detail panel is a different thing and does get the overlay — see §12.

### 11. Durability: an append-only changelog and one level of body snapshot

Validation (§9) and concurrency (§8) are two thirds of §1's debt. This is the third.

`chart.changelog.json` sits beside `chart.json` in the shape `notes-changelog-store.ts` already establishes — append-only `{ at, actor, summary }`, one entry per API write — and the UI renders it as "what the agent did", which is itself part of the visibility the feature is for. A body write keeps its predecessor as `bodies/<nodeId>.md.prev`, giving one level of undo on the only content that is genuinely irreplaceable.

- **Rejected — `git init` over `~/.clashboard/gantt/`.** Full history, real diffs and unlimited undo, and `git-process.ts` is already here. But it puts a repository inside a configuration directory, commits on every PATCH, and the UI still needs a readable audit view because nobody reads `git log` in a dashboard. Named as the upgrade path, and the honest trigger for taking it is **wanting more than one level of undo**.
- **Rejected — nothing beyond archive-on-delete.** Unsquarable with calling this a system of record.

The storage layout follows `notes-store.ts` rather than the aggregate-JSON stores, for the reason that file states: a body is markdown someone may want to open. It is also what keeps the API cheap for its consumer — `GET /charts/:id` returns the skeleton with a `hasBody` flag and bodies are fetched per node, so an agent looking up a node id pays nothing for PRD prose, and a `PATCH` to one node does not rewrite every PRD in the chart.

```
~/.clashboard/gantt/<chartId>/
  chart.json               the tree, edges, jiraSources, lastSyncedAt
  chart.changelog.json     append-only audit, one entry per write
  bodies/<nodeId>.md       one PRD or issue each
  bodies/<nodeId>.md.prev  one level of undo
~/.clashboard/gantt/.archive/<chartId>/   archived, never erased
```

### 12. The SKILL is a copied artifact, parameterised, and tested against the schema

The button copies the **whole SKILL** with the base URL and the current chart's id already substituted, so pasting it into an agent and saying "add a PRD for tier migration" needs no further briefing; the same text is served at `GET /api/gantt/skill` for an agent that would rather fetch it. _Rejected — copying an install command:_ an indirection, and an installed copy that can silently diverge from the running server. _Rejected — copying the file verbatim:_ friction on the step that is easiest to get wrong.

Two tests are **structural, not optional**, both following `explain-skill.test.ts`: the skill text must name every field the schema requires, and the skill's literal `curl` example bodies must validate against the real schema. The comment on that test records what it costs not to have one.

The SKILL's **first instruction** is to probe `GET /api/gantt/charts` and, on connection-refused, stop and report that clashboard is not running. The API exists only while `vite dev` does — there is no `start` script and `AuthGate` is a Jira-credentials liveness check, not authentication — and an agent that queues work or falls back to writing the files directly would bypass the write queue, the validation and the audit trail that §8, §9 and §11 exist to provide. Daemonising the server is the upgrade path, and the trigger is wanting unattended runs.

**No authentication, bound to localhost.** A token would add nothing: any process that can reach the API can already read and write `~/.clashboard/` directly.

## Consequences

- **CONTEXT-MAP's headline claim is amended, in one sentence, with a reason.** "A viewer, not a system of record" becomes "a viewer of other systems' records, and the system of record for the plan that spans them" — and §1's exception is the only place it applies.
- **`ShellVariant` gains a fourth arm and `BoardVariant` is untouched again.** The header's board props were already optional; `'gantt'` takes the same shape `'explain'` takes. The palette host likewise.
- **`routes/api/` stops being a binary-stream layer.** It now hosts three consumer shapes — a binary proxy, an SSE channel, and a REST contract — and ADR-0006's rule of thumb grows a third arm rather than an exception.
- **`ActionKind` gains `show-in-gantt` on the free letter `g`.** Legality is "this item's key appears on some chart", which needs a key→chart reverse index, in the shape `open-workspace`'s legality already establishes. Adding it is a compile error until every arm handles it, which is the point.
- **A new `Column` consumer.** Board, Review and now Gantt share it; `blocked` being derived rather than a fifth column is what keeps the vocabulary one thing.
- **The first feature where the UI cannot write what the API can.** The asymmetry is deliberate and stated on both sides: the SKILL says the agent is the only writer, and the surface offers no control that would contradict it.
- **One-level undo is a known ceiling.** "The agent rewrote my PRD" is recoverable; "it did that three times" is not. §11 names the trigger for taking git.
- **A new dependency edge, bounded on arrival: `server/` may import a kernel _leaf_.** `gantt-schema.ts` takes `COLUMNS` from `kernel/columns` rather than keeping a second copy of the column vocabulary — the first `src/server` → `~/kernel` import in the repository. The edge is safe only in that form: the kernel **barrel** re-exports types _from_ `server/lib` (`kernel/explain.ts`, `kernel/gantt.ts`), so an import of `~/kernel` from inside `server/` closes a real cycle. A `server-cant-import-the-kernel-barrel` dependency-cruiser rule makes the distinction enforceable rather than remembered — leaf in, barrel out.
- **Row windowing is designed for and not implemented.** `layout` takes a visible range from inception; the windowing that would use it is not in the slice plan.

## Deliberately out of scope

Drag-to-reschedule and drag-to-reparent; writing dates back to Jira; MR status on a node; raw JQL as a chart source; daemonising the server; git-backed chart history; an MCP server. Each is an upgrade path with a named trigger, and none is a gap left unnoticed.

## References

- ADR-0003 — Framework-free view-models; the claim §10's pure layout function is the strongest evidence for.
- ADR-0004 — neverthrow on the client, Effect on the server; the contract §7 keeps for the UI and §9 declines to reuse over HTTP.
- ADR-0005 — Effect-TS server architecture; the RPC boundary the UI's half of §7 belongs to.
- ADR-0006 — Binary-stream API routes; **amended** by §7 (a third consumer arm) and §9 (body shape follows the consumer).
- ADR-0007 — A left-nav app shell with more than one board; the layout-route upgrade path §2 declines for the second time.
- ADR-0008 — Command-palette action catalogue; the closed union `show-in-gantt` joins.
- ADR-0009 — Explain surface and long-running agent runs; §1's chrome extraction, and the fourth-surface trigger §2 answers.

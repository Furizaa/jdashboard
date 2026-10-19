# The Gantt View

## Problem Statement

clashboard has a surface for "what am I working on today" (the board) and one for "what am I advising on" (the watchlist). It has none for **"where is this programme of work, and what is waiting on what"**. A multi-PRD project — several epics, a dozen features, dependencies between them, some of it ticketed and some of it still only a document — is invisible here.

It is also invisible to the agents working on it. Agents write PRDs and issues into repositories, where they are scattered across worktrees, unreadable as a whole, and impossible for a second agent to find or revise. There is no shared place where the plan lives, so there is no plan — only a pile of files each agent has a private opinion about.

## Solution

A fourth nav-rail surface, `/gantt`, showing **Gantt charts**: a recursive tree of lanes over a time axis, with `blocks` arrows between them, each lane able to carry a markdown body that opens inline.

A chart's nodes come from two places **at once**:

1. **Mirrored Jira tickets.** `POST /charts { jiraSources: ['GEO-120'] }` discovers an epic's children and fills the chart with one node each — flat, undated, placed by Jira's parent as a one-time suggestion. A non-destructive sync keeps their title, status and assignee current.
2. **Agent-authored PRDs and issues.** Nodes the chart is the only copy of, with markdown bodies stored beside the chart. For these, clashboard is the system of record.

Agents maintain charts through a **documented REST API** at `/api/gantt/*`. The UI is **read-only** — expand, collapse, zoom, read, sync, archive — so there is exactly one writer. A button copies the SKILL that teaches the API, with the base URL and chart id already substituted.

The design decisions and their rejected alternatives are recorded in **[ADR-0012](../../docs/adr/0012-gantt-charts-as-a-system-of-record.md)**; this PRD is the implementation plan.

---

## User Stories

1. As an architect, I want one chart showing every PRD in a programme over a time axis, so that "where is this project" is a glance rather than an archaeology exercise.
2. As an architect, I want lanes to nest to any depth, so that a PRD can hold features which hold tasks without the chart deciding how deep my plan is allowed to be.
3. As an architect, I want **arrows** between lanes at any depth, so that what is waiting on what is visible rather than described in prose somewhere.
4. As an architect, I want an arrow whose endpoint I have collapsed to **re-anchor** to the lane I can see, so that collapsing summarises my dependencies instead of hiding them.
5. As an architect, I want a fully collapsed chart to be a readable PRD-level dependency graph, because that is the altitude I plan at.
6. As an architect, I want to see a **cycle** called out by name, because a plan where two PRDs each wait on the other is impossible and must not look possible.
7. As an architect, I want a lane's attached PRD to open **inline, under the lane**, so that comparing two of them is two clicks and no navigation.
8. As an architect, I want a parent lane to show **how many of its children are done**, not an averaged state, because the distribution is the answer I came for.
9. As an architect, I want a PRD whose features have slipped past its declared window to **show the overrun**, so that slip is visible rather than silently absorbed.
10. As an architect, I want existing Jira tickets grouped **under my own PRD lanes**, because Jira's hierarchy is Jira's opinion and the plan is mine.
11. As an architect, I want sync to **never move or delete** a node, so that the arrangement I asked an agent to build survives a ticket being moved out of an epic.
12. As an architect, I want a ticket that left the epic **marked**, not removed, so that I find out rather than quietly losing its children, body and dates.
13. As an architect, I want newly discovered tickets gathered into one **"Needs attention"** count, so that one instruction to an agent fixes everything awaiting judgement.
14. As an architect, I want a Jira lane to show its real status name and assignee, so that the chart answers "who has this" without a trip to Jira.
15. As an architect, I want to click a Jira lane and get the **real detail panel** — ADF, comments, transitions, notes — because that is already the best ticket reader I have.
16. As an architect, I want `g` in ⌘K to take me from a ticket to **where it sits in the plan**, because that is the direction I actually need.
17. As an agent, I want a **documented REST contract** with readable ids, so that I can maintain a chart across many turns without carrying a map of opaque identifiers.
18. As an agent, I want a **structured validation error naming the field**, so that a rejected write is something I can correct rather than a dead end.
19. As an agent, I want to be told clashboard is not running, **loudly and first**, so that I never do an hour of planning work into a socket that is refusing connections.
20. As a user of agents, I want an append-only **changelog** of every write, so that "what has the agent been doing to my plan" has an answer in the UI.
21. As a user of agents, I want one level of **undo on a PRD body**, so that a rewrite I did not want is recoverable.
22. As a user of agents, I want **no delete verb in the API at all**, so that no paraphrased instruction can erase a quarter of planning.

---

## Implementation Decisions

### The chart shape

Stored **flat with `parentId`**, presented as a tree. Depth is unbounded — that is a statement about the domain, not about the JSON — but node-level `PATCH` over nested children would be path-addressed tree surgery on every write, and reparenting would be a move rather than a field. `domain/tree.ts` builds the tree; the store never sees one.

```ts
type GanttChart = {
  version: 1
  id: string // slug, = folder name
  title: string
  jiraSources: readonly string[] // epic keys; server builds the JQL
  lastSyncedAt: string | null
  createdAt: string
  nodes: readonly GanttNode[]
  edges: readonly GanttEdge[]
}

type GanttNode = {
  id: string // agent-supplied slug, unique in chart
  parentId: string | null
  order: number // sibling ordering
  title: string //  mirrored when source.kind === 'jira'
  source: { kind: 'jira'; key: string } | { kind: 'local' }
  start: string | null // YYYY-MM-DD, chart-owned, nullable
  end: string | null // YYYY-MM-DD, chart-owned, nullable
  column: Column //  mirrored (columnForStatus) when jira
  status: string | null //  mirrored; the real HDR status name
  assignee: string | null //  mirrored
  orphaned: boolean // set by sync when the key left the epic
}

type GanttEdge = {
  id: string
  from: string // node id — `from` blocks `to`
  to: string
  source: { kind: 'jira'; linkId: string } | { kind: 'local' }
}
```

`hasBody` is **derived at read time** from the presence of `bodies/<id>.md`, never stored — a stored flag is a second source of truth for a file's existence. There is no `kind` on an edge: every edge is `from blocks to`, and a second relation is additive.

**Mirrored fields are marked above with a bullet.** Sync writes exactly those and nothing else. Everything unmarked is chart-owned on every node regardless of source.

### Surfaces and routing

- `routes/-app-chrome.tsx` — **changed.** `ShellVariant` gains `'gantt'`. `isBoard` already excludes non-boards; `'gantt'` joins `'explain'` in showing only the global tools. No new props.
- `routes/-nav/NavRail.tsx` — a fourth item, `/gantt`, icon `ChartGantt`, testid `nav-gantt`.
- `routes/gantt.tsx` — **new** file route. Search schema `{ chart?: string; issue?: string; node?: string }`, validated in `routes/-gantt/gantt-search.ts` the way `explain-search.ts` validates `mr`. Renders `GanttShell`.
- `routes/-gantt/GanttShell.tsx` — **new.** `AppChrome variant="gantt"` with `contexts/gantt`'s `ChartList` or `GanttChartView` in `children`, and `IssueDetailPanel` in `overlay` — the ADR-0009 slot, filled for the first time outside `AppShell`. `?node=` reveals and scrolls to a node (the palette's `g` hand-off); consumed on arrival with `replace`, exactly as `AppShell` consumes `?ai=`.

### The new bounded context: `src/contexts/gantt/`

```
domain/       tree.ts          (parentId list → tree; visible rows under a collapse set)
              blocked.ts       (derive blocked | unresolvable from the edge graph)
              cycles.ts        (detect, name the loop, mark its edges)
              progress.ts      (descendant Column distribution; the n-of-m rollup)
              child-span.ts    (derived underlay from dated descendants only)
view-model/   gantt-layout.ts  (the pure layout; no React import)
              gantt-state.ts   (collapse / info-band / zoom state machine)
presenter/    use-gantt-chart.ts, use-gantt-charts.ts
view/         GanttChartView.tsx, GanttAxis.tsx, GanttRow.tsx, GanttBar.tsx,
              GanttArrows.tsx, InfoBand.tsx, NeedsAttention.tsx, CycleWarning.tsx,
              ZoomControls.tsx, ChartList.tsx, CopySkillButton.tsx,
              ArchiveChartDialog.tsx, ChangelogPopover.tsx
```

The layout function is the context's centre of gravity:

```ts
layout(chart: GanttChart, opts: {
  zoom: 'week' | 'month' | 'quarter'
  collapsed: ReadonlySet<string>
  expandedInfo: ReadonlySet<string>
  visibleRange: { first: number; count: number }   // row windowing, designed for
  today: string
}): GanttLayout   // { ticks, rows, bars, childSpans, arrows, cycles, needsAttention }
```

No React import, pure, table-tested. Arrow re-anchoring is a projection step over the visible row set: an endpoint not in it walks to its nearest visible ancestor; arrows collapsing onto the same pair merge with a `count`; a pair that collapses to one node is dropped.

Five new dependency-cruiser rules mirroring every other context: `gantt-domain-only-imports-kernel`, `gantt-application-only-imports-kernel-and-self` (declared from inception though there is no context-local application service — both halves are coordinator hooks over server functions, as in `explain`), `gantt-view-model-only-imports-kernel-and-domain`, plus the existing `routes/api` rules extended to cover the new files.

### Server

- `server/lib/gantt-schema.ts` — **new.** The Zod schema and the exported types above; `assertChartId` / `assertNodeId` over `^[a-z0-9][a-z0-9-]{0,63}$` in the shape `assertIssueKey` establishes; `toIssues(zodError)` producing the `{ path, expected, received }` list §9 of the ADR specifies.
- `server/lib/gantt-store.ts` — **new.** Injected-fs store over `~/.clashboard/gantt/<chartId>/`: `readChart`, `writeChart`, `listCharts`, `readBody`, `writeBody` (snapshotting the predecessor to `.md.prev`), `hasBody`, `archiveChart`. Missing files read as absent, never throw, per `notes-store.ts`.
- `server/lib/gantt-changelog-store.ts` — **new.** Append-only `{ at, actor, summary }` beside `chart.json`, mirroring `notes-changelog-store.ts` exactly.
- `server/lib/gantt-writes.ts` — **new.** The per-chart serialised write queue: a promise chain per chart id so read-modify-write is atomic, with the changelog entry appended inside the critical section. Plain DI module.
- `server/lib/gantt-skill.ts` — **new.** `GANTT_SKILL_PATH` and `renderGanttSkill({ baseUrl, chartId })`, loaded via `loadSkillBody` from `process.cwd()/.claude/skills/...` as `ask.ts` and `refine.ts` do.
- `server/contexts/gantt/domain/discovery-jql.ts` — **new.** `parent in (...)` built with `assertIssueKey` over every source key, in the shape `watchlist/domain/candidate-jql.ts` establishes.
- `server/contexts/gantt/domain/reconcile.ts` — **new.** Pure: `(chart, discovered) → { mirrorUpdates, additions, orphanedIds }`. Never produces a move or a delete — that invariant is what the tests assert.
- `server/contexts/gantt/application/{load-chart,mutate-chart,sync-chart,bootstrap-chart}.ts` — **new.** The use-cases both the REST routes and the server functions call, per ADR-0006's own sentence.
- `server/contexts/gantt/errors.ts` — **new.** `ChartNotFound`, `NodeNotFound`, `DuplicateNodeId`, `InvalidChartPayload`, `JiraUnreachable`.
- `server/server-functions/gantt.ts` — **new.** The UI's read side plus its two lifecycle verbs: `listGanttCharts`, `getGanttChart`, `getGanttBody`, `getGanttChangelog`, `syncGanttChart`, `archiveGanttChart`, `getGanttSkill`, `getGanttKeyIndex`. Ordinary `toWire`.
- `server/contexts/board/application/load-board.ts` — **changed.** `BOARD_FIELDS` is untouched; the **sync** path requests its own field list (`summary`, `status`, `assignee`, `issuetype`, `parent`, `issuelinks`) through `searchIssues`, so one call per sync covers mirrored fields and the whole epic's links.

### The REST surface — `src/routes/api/`

Nine route files plus one non-route helper (`-gantt-http.ts`, excluded from route discovery by its `-` prefix, holding the decode / status-mapping / JSON-error plumbing).

| Method   | Path                                            | File                                     |
| -------- | ----------------------------------------------- | ---------------------------------------- |
| `GET`    | `/api/gantt/skill`                              | `gantt.skill.ts`                         |
| `GET`    | `/api/gantt/charts`                             | `gantt.charts.ts`                        |
| `POST`   | `/api/gantt/charts`                             | `gantt.charts.ts`                        |
| `GET`    | `/api/gantt/charts/:chartId`                    | `gantt.charts.$chartId.ts`               |
| `PATCH`  | `/api/gantt/charts/:chartId`                    | `gantt.charts.$chartId.ts`               |
| `POST`   | `/api/gantt/charts/:chartId/sync`               | `gantt.charts.$chartId.sync.ts`          |
| `POST`   | `/api/gantt/charts/:chartId/nodes`              | `gantt.charts.$chartId.nodes.ts`         |
| `PATCH`  | `/api/gantt/charts/:chartId/nodes/:nodeId`      | `gantt.charts.$chartId.nodes.$nodeId.ts` |
| `DELETE` | `/api/gantt/charts/:chartId/nodes/:nodeId`      | `gantt.charts.$chartId.nodes.$nodeId.ts` |
| `GET`    | `/api/gantt/charts/:chartId/nodes/:nodeId/body` | `…nodes.$nodeId.body.ts`                 |
| `PUT`    | `/api/gantt/charts/:chartId/nodes/:nodeId/body` | `…nodes.$nodeId.body.ts`                 |
| `POST`   | `/api/gantt/charts/:chartId/edges`              | `gantt.charts.$chartId.edges.ts`         |
| `DELETE` | `/api/gantt/charts/:chartId/edges/:edgeId`      | `gantt.charts.$chartId.edges.$edgeId.ts` |

**There is no `DELETE /charts/:chartId`.** Its absence is asserted by a test, because an endpoint that was never written is indistinguishable from one that was deleted by accident.

Status mapping: `400` charset or schema (body carries `issues[]`), `404` unknown chart / node / edge, `409` duplicate node id, `503` Jira unreachable during sync, `500` defect.

### Client plumbing

- `kernel/gantt.ts` — type-only re-exports of the chart shapes and the server-function result types, per the rule that contexts never import `~/server/...` directly.
- `coordinator/hooks.ts` — `useGanttCharts`, `useGanttChart`, `useGanttBody`, `useGanttChangelog`, `useSyncGanttChart`, `useArchiveGanttChart`, `useGanttSkill`, `useGanttKeyIndex`.
- `coordinator/adapters/tanstack-cache.ts` — `ganttCharts: 30_000`, `ganttChart: 30_000`, `ganttBody: 30_000`, `ganttChangelog: 30_000`, `ganttKeyIndex: 60_000`. No interval.
- `kernel/commands.ts` — `show-in-gantt` added to `ActionKind` on the letter **`g`**, group `workflow`. Legality: the item's Jira key appears in the key index. Plus an `open-gantt-chart` global command in the `commands` group.
- `lib/testids.ts` — `navGantt`, `ganttSurface`, `ganttChartList`, `ganttRow`, `ganttBar`, `ganttChildSpan`, `ganttArrow`, `ganttInfoToggle`, `ganttInfoBand`, `ganttNeedsAttention`, `ganttCycleWarning`, `ganttZoom`, `ganttCopySkill`, `ganttSync`, `ganttArchive`, `ganttChangelog`.
- Collapse, info-band and zoom state are **per-viewer `localStorage`** keyed by chart id, per ADR-0007's precedent for lane collapse — never fields in `chart.json` an agent could fight with.

### The SKILL

`.claude/skills/clashboard-gantt/SKILL.md`, `disable-model-invocation: true`, mirroring `explain-mr`'s frontmatter. Its first instruction is the probe-or-stop. It teaches: the node and edge shapes field by field, slug ids, that dates are `YYYY-MM-DD` or `null`, that mirrored fields must not be patched on a jira node, that `DELETE /charts` does not exist, and how to read an `issues[]` error. Two structural tests, both after `explain-skill.test.ts`:

- **Every required field of the schema is named somewhere in the skill text**, introspected from the Zod shape rather than listed, so a new field is covered the day it is added.
- **Every `curl` body in the skill validates against the real schema**, extracted from the fenced blocks — the half the explain test does not have, and the half that would have caught the bug its comment describes.

---

## Slice Plan

Each slice is independently committable and leaves the app working. Verification is the gate, in the project's pre-push order (`pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test`) — noting that `check:arch` is advisory and already fails on master.

```
90 ─┬─→ 91 ─→ 92 ─→ 96 ─┐
    └─→ 93 ─┬─→ 94      ├─→ 97
            └─→ 95 ─────┘
```

| #   | Slice                                                                                                                                                                                              | Verify                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 90  | **The chart contract and its store.** `gantt-schema.ts`, `gantt-store.ts`, `gantt-changelog-store.ts`, `kernel/gantt.ts`.                                                                          | Unit tests over the schema (every field, bad slug, bad date, unknown source kind), the store with a fake fs (missing files, `.prev` snapshot, archive), `toIssues`.                                                        |
| 91  | **The layout function.** `domain/{tree,blocked,cycles,progress,child-span}.ts` and `view-model/gantt-layout.ts`.                                                                                   | Pure table-driven tests: nesting, collapse, arrow re-anchoring and merge, same-parent self-loop drop, cycles, n-of-m rollup, overflow underlay, undated nodes, the three zooms. **No React import anywhere in the slice.** |
| 92  | **The surface, read-only.** `ShellVariant`, nav item, `/gantt` route, `GanttShell`, read-side server functions and hooks, every `view/` component, rendering a chart from disk.                    | `pnpm depcruise` (the new rules). Hand-write a `chart.json` and open it: tree, bars, arrows, info band, zoom, needs-attention, cycle warning.                                                                              |
| 93  | **The write surface.** `gantt-writes.ts`, `server/contexts/gantt/{application,errors}`, the nine route files and `-gantt-http.ts`.                                                                 | Route-handler unit tests per ADR-0006's precedent, one per status code. The no-`DELETE /charts` assertion. `curl` each verb against a live server and watch `chart.json` and the changelog change.                         |
| 94  | **The SKILL and the button.** `.claude/skills/clashboard-gantt/SKILL.md`, `gantt-skill.ts`, `GET /api/gantt/skill`, `CopySkillButton`, both structural tests.                                      | The two tests. Then the real one: paste the copied SKILL into an agent and ask it to build a three-PRD chart from scratch.                                                                                                 |
| 95  | **Jira bootstrap and sync.** `discovery-jql.ts`, `reconcile.ts`, `sync-chart.ts`, `bootstrap-chart.ts`, `POST /charts` with `jiraSources`, `POST /sync`, orphan badges, the stale-on-open trigger. | Reconcile tests asserting the invariant directly: **no output of `reconcile` is ever a move or a delete.** Then bootstrap a chart from a real epic and sync it after moving a ticket out.                                  |
| 96  | **Hand-offs.** Palette `show-in-gantt` on `g` + `open-gantt-chart`, the key index, `IssueDetailPanel` in `GanttShell`'s overlay, `?node=` reveal, archive dialog.                                  | Full pre-push gate. Run the app: `g` from a ticket lands on its node; the detail panel opens over the chart and ⌘K still works above it; archive moves the folder.                                                         |
| 97  | **Docs and e2e.** `contexts/gantt/CONTEXT.md`, CONTEXT-MAP rows and the amended headline claim, README context list, ADR-0006 amendment note, `pnpm docs:arch`, e2e specs.                         | `pnpm test:e2e`.                                                                                                                                                                                                           |

### Known scope boundaries

- **No drag editing.** The UI cannot move a bar, reparent a node, draw an arrow, edit a title or write a body. One writer is the design, stated on both sides (ADR-0012 §8); direct manipulation is additive against an API that will already exist.
- **No date write-back to Jira**, and no Jira date read. Dates are chart-owned, full stop (§4).
- **Row windowing is designed for, not implemented.** `layout` takes a `visibleRange` from inception so a three-hundred-node chart is a change to one caller rather than to the function.
- **One level of body undo.** `.md.prev` covers "the agent rewrote my PRD" and not "it did that three times". Git over `~/.clashboard/gantt/` is the named upgrade path (§11).
- **The API lives only while `vite dev` does.** No `start` script, no daemon, no auth, localhost only. The SKILL's probe-or-stop is the whole mitigation (§12).
- **No MR status on a node**, no raw JQL source, no MCP server. Upgrade paths with named triggers, not oversights.
- **No `CLASHBOARD_HOME` override**, consistent with every other local store. The e2e specs mock at the network boundary (ADR-0001) and the store is covered by a fake fs.

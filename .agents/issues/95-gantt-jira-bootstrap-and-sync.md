# 95 — Jira bootstrap and sync

**Type:** AFK

## Parent

[The Gantt View PRD](../prds/gantt-view.md) · [ADR-0012 §5, §6](../../docs/adr/0012-gantt-charts-as-a-system-of-record.md)

## What to build

The Jira half: one call fills a chart from its epics, and one verb keeps the mirrored fields current without ever moving or deleting anything.

- **`src/server/contexts/gantt/domain/discovery-jql.ts`** — new, pure. `discoveryJql(epicKeys)` → `parent in (GEO-120, GEO-355)`, with `assertIssueKey` over every key. Read `server/contexts/watchlist/domain/candidate-jql.ts` first and match its shape and its guards. An empty source list returns `null` and the caller skips the search rather than issuing a query matching everything.
- **`src/server/contexts/gantt/domain/reconcile.ts`** — new, pure, and the heart of the slice. `reconcile(chart, discovered)` → `{ mirrorUpdates, additions, orphanedIds, edgeAdditions, edgeRemovals, edgePromotions }`.
  - `mirrorUpdates` carries **only** `title`, `column` (via `columnForStatus`), `status` and `assignee`, per node id.
  - `additions` are discovered keys with no node, as **flat, undated** nodes placed by Jira's `parent` when that parent is itself a node in the chart, and at the root otherwise.
  - `orphanedIds` are jira nodes whose key is no longer discovered.
  - `edgeAdditions` / `edgeRemovals` cover **jira-sourced edges only**, reconciled from the tickets' `issuelinks` (blocks / is blocked by, normalised to one direction). A **local** edge is never removed.
  - `edgePromotions`: a local edge whose endpoint pair now appears as a real Jira link becomes `jira`, rather than being drawn twice.
  - **The invariant the tests assert directly: no output of `reconcile` is ever a move or a delete of a node.** There is no field in the return type that could express one.
- **`src/server/contexts/gantt/application/bootstrap-chart.ts`** — `POST /charts` with `jiraSources` creates the chart and immediately applies the first reconcile, so a new chart arrives populated. One `searchIssues(discoveryJql(keys), fields)` call — fields `['summary','status','assignee','issuetype','parent','issuelinks']` — covering mirrored fields and the whole epic's links together.
- **`src/server/contexts/gantt/application/sync-chart.ts`** — the same reconcile applied to an existing chart, inside `withChartLock`, writing `lastSyncedAt` and **one** changelog entry with `actor: 'sync'` summarising counts (`3 updated · 2 added · 1 orphaned`). Jira unreachable → `JiraUnreachable`, mapped to `503`, leaving the chart untouched.
- **`src/routes/api/gantt.charts.$chartId.sync.ts`** — wired to the application service (the file exists from slice 93; this slice gives it its body).
- **`src/server/server-functions/gantt.ts`** — `syncGanttChart` for the UI.
- **`src/coordinator/hooks.ts`** — `useSyncGanttChart`, invalidating the chart query on success.
- **`src/contexts/gantt/presenter/use-gantt-chart.ts`** — fires sync on mount when `lastSyncedAt` is older than five minutes (a named constant, not a literal at the call site), and the header's Refresh triggers it for the open chart. **It must not fire on every render, and must not fire while one is in flight.** Prefer a mutation guarded on the query's data over an effect; if an effect is unavoidable, use the project's `useMountEffect` escape hatch and say why in a comment.
- **`src/contexts/gantt/view/GanttRow.tsx`** — the `orphaned` badge, and the `status` string shown for a jira node (the real HDR status name, not the bucketed `Column`).

## Acceptance criteria

- [ ] `discoveryJql` builds `parent in (...)` with every key guarded, and returns `null` for an empty list.
- [ ] **A test asserts `reconcile`'s return type cannot express a node move or delete**, and behavioural tests confirm: a ticket whose Jira parent changed keeps its chart placement; a ticket removed from the epic is marked `orphaned` and **still present**, with its children, body, dates and local edges intact.
- [ ] A newly discovered ticket is added flat and undated, placed under its Jira parent when that parent is a node in the chart and at the root otherwise.
- [ ] `mirrorUpdates` changes only the four mirrored fields; a test asserts `start`, `end`, `parentId` and `order` are untouched.
- [ ] A jira link that disappeared removes its jira edge; a **local** edge between the same pair survives.
- [ ] A local edge whose pair appears as a Jira link is **promoted**, not duplicated.
- [ ] `POST /charts { jiraSources }` returns a chart already populated from one `searchIssues` call.
- [ ] Sync writes `lastSyncedAt` and exactly one `actor: 'sync'` changelog entry naming the counts.
- [ ] Jira unreachable returns `503` and leaves `chart.json` byte-identical.
- [ ] Opening a chart whose `lastSyncedAt` is older than five minutes triggers exactly one sync; opening a fresh one triggers none; re-rendering triggers none.
- [ ] A jira row shows its real status name and assignee, and an orphaned row shows the badge.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` pass.

## Blocked by

- [93 — The write surface](./93-gantt-write-surface.md)

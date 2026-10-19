# 90 — The chart contract and its store

**Type:** AFK

## Parent

[The Gantt View PRD](../prds/gantt-view.md) · [ADR-0012](../../docs/adr/0012-gantt-charts-as-a-system-of-record.md)

## What to build

The schema, the stores, and the kernel re-export. No UI, no routes, no Jira.

- **`src/server/lib/gantt-schema.ts`** — new.
  - Zod schemas and inferred types for `GanttChart`, `GanttNode`, `GanttEdge`, `GanttNodeSource`, `GanttEdgeSource`, exactly as the PRD's "chart shape" section specifies. `version` is the literal `1`.
  - `column` uses the kernel `Column` union (`~/kernel/columns`), not a new string union.
  - `start` / `end` are `YYYY-MM-DD` or `null` — a regex-guarded string, not `z.date()`, because the wire and the file are both JSON.
  - `assertChartId(value, label)` and `assertNodeId(value, label)` over `^[a-z0-9][a-z0-9-]{0,63}$`, throwing in the shape `assertIssueKey` in `src/server/lib/jql.ts` establishes. These are the path guards slice 90's store depends on — never interpolate an unguarded id into a path.
  - `toIssues(error: z.ZodError): ReadonlyArray<{ path: string; expected: string; received: string }>` — the structured error payload ADR-0012 §9 specifies. `path` is dot-joined (`nodes.2.start`).
  - Request-body schemas for the write surface, so slice 93 does not invent its own: `createChartBody`, `patchChartBody`, `createNodeBody`, `patchNodeBody`, `createEdgeBody`. A **patch body forbids mirrored fields** (`title`, `column`, `status`, `assignee`) when the target node's source is `jira` — express what can be expressed in the schema, and leave the source-dependent half to the application service in slice 93 with a `TODO(93)` naming it.
  - `hasBody` is **not** in the node schema. It is derived at read time.
- **`src/server/lib/gantt-store.ts`** — new. Plain dependency-injected module with a `GanttStoreDeps` of injected fs functions, in the exact shape of `notes-store.ts` (read the file first; match its deps, its comment style, and its missing-file-reads-as-absent behaviour).
  - `ganttDir(homeDir)`, `chartDir(homeDir, chartId)`, `chartFilePath`, `bodyFilePath`, `bodyPrevFilePath`, `archiveDir`.
  - `listCharts(deps)` → chart summaries (`id`, `title`, `jiraSources`, `lastSyncedAt`, node count, done count), read from each `chart.json`. A missing or unparseable `chart.json` is **skipped**, not thrown — one corrupt chart must not break the list.
  - `readChart(chartId, deps)` → `GanttChart | null`, validated through the schema. Invalid content reads as `null`.
  - `writeChart(chart, deps)` — writes `chart.json`, creating the directory.
  - `readBody(chartId, nodeId, deps)` → `string | null`.
  - `writeBody(chartId, nodeId, markdown, deps)` — **snapshots the current body to `<nodeId>.md.prev` first** when one exists. That snapshot is the one level of undo ADR-0012 §11 buys; it is not optional.
  - `hasBody(chartId, nodeId, deps)` and `bodyNodeIds(chartId, deps)` — one directory read the chart's skeleton derives every `hasBody` from, mirroring `listNoteKeys`'s one-shared-read shape.
  - `archiveChart(chartId, deps)` — moves the folder under `~/.clashboard/gantt/.archive/<chartId>/`. Collision with an existing archive entry suffixes a timestamp rather than overwriting.
  - `.archive` is excluded from `listCharts`.
- **`src/server/lib/gantt-changelog-store.ts`** — new. Append-only `{ at, actor, summary }` at `<chartDir>/chart.changelog.json`, mirroring `notes-changelog-store.ts` exactly (read it first). `actor` is `'agent' | 'sync' | 'user'`. Robust against a missing or unparseable file — each reads as the empty changelog.
- **`src/kernel/gantt.ts`** — new. **Type-only** re-exports of the chart shapes, following `kernel/explain.ts`'s pattern and its comment about why values are not re-exported (the Zod schema's one job is the server boundary).

## Acceptance criteria

- [ ] `gantt-schema.ts` parses a valid chart, and rejects: a bad node id (`Tier Migration`), a bad date (`next week`), an unknown `source.kind`, a `version` other than `1`, an edge whose `from` is absent from `nodes`.
- [ ] `toIssues` returns a dot-joined path, an `expected` and a `received` for each failure, covered by a test over a chart with two distinct problems.
- [ ] `assertChartId` / `assertNodeId` accept `tier-migration` and `geo-412`, and reject `../escape`, `Tier`, `-leading`, a 65-character slug, and the empty string.
- [ ] `gantt-store.ts` uses only injected fs deps — no `node:fs` import — and is unit-tested with a fake, table-driven over present/missing/corrupt.
- [ ] `writeBody` snapshots an existing body to `.md.prev` before overwriting, and does not create a `.prev` when there was no body.
- [ ] `listCharts` skips a chart whose `chart.json` is corrupt, and excludes `.archive`.
- [ ] `archiveChart` moves the folder and does not overwrite an existing archive entry of the same id.
- [ ] `gantt-changelog-store.ts` appends in order, reads a missing file as `[]`, and reads an unparseable file as `[]`.
- [ ] `kernel/gantt.ts` exports types only; a value import from it is a type error.
- [ ] No file in this slice imports React, `effect`, or anything under `src/contexts/`.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` pass.

## Blocked by

—

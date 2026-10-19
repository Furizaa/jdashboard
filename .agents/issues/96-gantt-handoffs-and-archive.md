# 96 — Hand-offs and archive

**Type:** AFK

## Parent

[The Gantt View PRD](../prds/gantt-view.md) · [ADR-0012 §8](../../docs/adr/0012-gantt-charts-as-a-system-of-record.md)

## What to build

The ways in and the one way out.

- **`src/kernel/commands.ts`** — `show-in-gantt` added to `ActionKind` on the letter **`g`** (free: taken letters are `d s n t w r a o c y m v e f x`, with `j`/`k` reserved), group `workflow`, label `Show in Gantt`. Adding the arm is a compile error until every exhaustive match handles it — follow the compiler.
- **`src/server/server-functions/gantt.ts`** — `getGanttKeyIndex()` → `ReadonlyRecord<issueKey, { chartId: string; nodeId: string }>`, built from one pass over every chart's nodes. This is the palette's legality input.
- **`src/coordinator/hooks.ts`** — `useGanttKeyIndex`, `staleTime: DASHBOARD_STALE_TIMES.ganttKeyIndex` (`60_000`).
- **Palette wiring** — `show-in-gantt` is legal when the item's Jira key is in the index, in the shape `open-workspace`'s legality already takes (read `contexts/command-palette/.../action-legality.ts` first). Running it navigates to `/gantt?chart=<id>&node=<nodeId>` — a **URL hand-off**, so the palette still imports no context, exactly as `explain-mr` navigates to `/explain?mr=`.
- **An `open-gantt-chart` global command** in the `commands` group, listing charts as a sub-list where the status transitions and tags already establish the pattern.
- **`src/routes/-gantt/GanttShell.tsx`** — the `overlay` slot now carries `<IssueDetailPanel issueKey={issue ?? null} notesOpen={false} aiModal={null} onAiModalConsumed={noop} />`. This is ADR-0009's slot filled outside `AppShell` for the first time; ⌘K must keep working above it, which `AppChrome`'s existing ordering already guarantees.
- **Clicking a jira row** navigates to `/gantt?chart=…&issue=<KEY>` (`to: '.'`, preserving `chart`), as cards navigate board-relatively.
- **`?node=` reveal** — on arrival, expand every ancestor of the node, scroll it into view, and highlight it briefly; then **consume the param with `replace`**, exactly as `AppShell` consumes `?ai=`, so a refresh does not re-trigger the reveal and the back button does not land on it.
- **`ArchiveChartDialog.tsx`** + `archiveGanttChart` server function + `useArchiveGanttChart`. A confirmed action naming the chart; on success, navigate to `/gantt` and invalidate the list. **No `DELETE` is added to the REST surface** — re-read ADR-0012 §8 before touching `routes/api/`.

## Acceptance criteria

- [ ] `g` on a ticket that appears on a chart offers "Show in Gantt"; on one that does not, the action is absent (not disabled).
- [ ] Running it lands on the right chart with the right node revealed, ancestors expanded and scrolled into view.
- [ ] `?node=` is consumed on arrival with `replace`; a refresh does not re-reveal and the back button does not return to it.
- [ ] "Open Gantt chart…" appears in the palette's commands group and its sub-list lists every chart.
- [ ] The palette still imports no context — the hand-off is the URL (`pnpm depcruise` is the proof).
- [ ] Clicking a jira row opens the real detail panel over the chart: ADF, comments, relationships, transitions all work.
- [ ] ⌘K opens over the detail panel on `/gantt`.
- [ ] Closing the panel returns to the chart with collapse and zoom state intact.
- [ ] Archive asks for confirmation, moves the folder to `.archive/`, navigates to `/gantt`, and the chart is gone from the list.
- [ ] **`grep -rn "DELETE" src/routes/api/gantt.charts.\$chartId.ts` finds no chart-level delete handler.**
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm depcruise`, `pnpm test` pass.

## Blocked by

- [92 — The surface, read-only](./92-gantt-surface-read-only.md)
- [95 — Jira bootstrap and sync](./95-gantt-jira-bootstrap-and-sync.md)

# 92 — The surface, read-only

**Type:** HITL

## Parent

[The Gantt View PRD](../prds/gantt-view.md) · [ADR-0012 §2, §10](../../docs/adr/0012-gantt-charts-as-a-system-of-record.md)

## What to build

The fourth surface, rendering a chart that already exists on disk. Read-only throughout — no control in this slice mutates chart data.

- **`src/routes/-app-chrome.tsx`** — `ShellVariant` gains `'gantt'`. `'gantt'` behaves as `'explain'` does: `isBoard` excludes it, so no New, no filter chip, no Only Workspace, no Configure lanes. **No new props** — if a prop is needed, the design is wrong.
- **`src/routes/-header/Header.tsx`** — only the comment above `isBoard` needs to learn there is a fourth surface. No behavioural change.
- **`src/routes/-nav/NavRail.tsx`** — a fourth `ITEMS` entry: `/gantt`, label `Gantt`, icon `ChartGantt` from lucide (verified present in lucide-react 1.14.0; `GanttChartSquare` is a deprecated alias there), testid `testIds.navGantt`.
- **`src/routes/-gantt/gantt-search.ts`** — `validateGanttSearch` over `{ chart?: string; issue?: string; node?: string }`, written the way `routes/-explain/explain-search.ts` is written, with its test. `node` is meaningless without `chart` and is dropped when absent, exactly as `validateBoardSearch` drops `notes` without `issue`.
- **`src/routes/gantt.tsx`** — the file route. `createFileRoute('/gantt')` with `validateSearch: validateGanttSearch`, rendering `GanttShell`.
- **`src/routes/-gantt/GanttShell.tsx`** — `AppChrome variant="gantt"` with `ChartList` (no `?chart=`) or `GanttChartView` (with one) in `children`. **The `overlay` slot is left empty in this slice** — the detail panel arrives in slice 96 — but the shell is written so filling it is one line.
- **`src/server/server-functions/gantt.ts`** — the read side only: `listGanttCharts`, `getGanttChart` (skeleton with `hasBody` derived from one `bodyNodeIds` read), `getGanttBody`, `getGanttChangelog`. Ordinary ADR-0005 `toWire`; read `server-functions/watchlist-lanes.ts` for the local-store-backed shape to copy.
- **`src/coordinator/hooks.ts`** — `useGanttCharts`, `useGanttChart`, `useGanttBody`, `useGanttChangelog`, with new `DASHBOARD_STALE_TIMES` entries (`ganttCharts`, `ganttChart`, `ganttBody`, `ganttChangelog`, all `30_000`, **no `refetchInterval`**).
- **`src/contexts/gantt/presenter/use-gantt-chart.ts`** — binds `gantt-state.ts` to React and owns the `localStorage` persistence of collapse / info-band / zoom, keyed by chart id. **Every read and write wrapped in try/catch**, rendering correctly when storage is unavailable. Follow the main board's collapsed-Done preference for the key shape.
- **`src/contexts/gantt/presenter/use-gantt-charts.ts`** — the list presenter.
- **`src/contexts/gantt/view/`** — `GanttChartView.tsx` (the grid frame), `GanttAxis.tsx`, `GanttRow.tsx`, `GanttBar.tsx` (segmented for a parent, per `progressFor`; blocked and cycle treatments), `GanttArrows.tsx` (one absolutely-positioned SVG overlay consuming `layout().arrows`, with the merge count rendered), `InfoBand.tsx` (height-capped markdown via `react-markdown` + `remark-gfm`, as the Notes panel does, with an "open full" affordance), `NeedsAttention.tsx`, `CycleWarning.tsx`, `ZoomControls.tsx`, `ChartList.tsx`, `ChangelogPopover.tsx`, and `index.ts`.
- **`src/contexts/gantt/index.ts`** — the context's public surface: `GanttChartView`, `ChartList`. Nothing else leaves.
- **`src/lib/testids.ts`** — the ids named in the PRD.
- **A fixture chart** committed under `src/contexts/gantt/view-model/__fixtures__/` (following `contexts/explain/view-model/__fixtures__/`) covering: three depths, a dated parent with overflowing children, an undated node, a cross-depth arrow, a merged arrow under collapse, a cycle, and an orphaned node. This fixture is what slice 97's snapshots and this slice's manual verification both use.

**Known friction handed over from slice 91:** the Zod-inferred `GanttChart` has **mutable** `nodes` / `edges` arrays, while the PRD writes them `readonly`. Test builders and the presenter both meet this. Do not "fix" it by widening your own types to mutable — if it bites, report it and it will be fixed in `gantt-schema.ts` as a follow-up, where the one source of truth is.

Styling follows the design system — read `src/design-system/` and an existing surface before writing a class. No new colour literals; use the existing tokens.

## Acceptance criteria

- [ ] The nav rail shows four items and `/gantt` highlights when active (and stays highlighted with `?chart=` or `?issue=` set — `activeOptions` already handles this).
- [ ] The header on `/gantt` shows only the global tools: no New, no filter chip, no Only Workspace, no Configure lanes.
- [ ] `/gantt` with no `?chart=` lists charts with title, epics, and an n-of-m progress summary; clicking one navigates to `/gantt?chart=<id>`.
- [ ] A hand-written `~/.clashboard/gantt/<id>/chart.json` renders: the tree with correct indentation, bars positioned on the axis, the today line, the three zoom controls.
- [ ] A parent bar is segmented by its leaf descendants' columns and states "7 of 11 done".
- [ ] A parent whose children overrun its declared window shows the derived child span as an underlay.
- [ ] An undated node renders as a dimmed row with no bar.
- [ ] Collapsing a lane re-anchors its arrows to the collapsed row, and three arrows collapsing onto one pair render as one with a count.
- [ ] A chart with a cycle shows the cycle warning naming the loop, and the cycle's arrows render distinctly.
- [ ] "Needs attention" states the undated, unplaced and orphaned counts in one line.
- [ ] A lane's info toggle opens the markdown band inline, height-capped with internal scroll, collapsed by default, with an escape to a full-width view.
- [ ] Collapse, info-band and zoom survive a reload, and the surface renders correctly with `localStorage` throwing.
- [ ] ⌘K opens over the surface and its global commands work.
- [ ] **No control on this surface mutates chart data.**
- [ ] `pnpm depcruise` passes.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` pass.

## Blocked by

- [91 — The layout function](./91-gantt-layout-function.md)

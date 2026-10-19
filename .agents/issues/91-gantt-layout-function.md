# 91 — The layout function

**Type:** AFK

## Parent

[The Gantt View PRD](../prds/gantt-view.md) · [ADR-0012 §10](../../docs/adr/0012-gantt-charts-as-a-system-of-record.md)

## What to build

The Gantt's whole geometry and every derived fact about a chart, as pure functions. **No React import anywhere in this slice** — that is the point of it (ADR-0003), and the acceptance criteria assert it.

- **`src/contexts/gantt/domain/tree.ts`** — `buildTree(nodes)` turning the flat `parentId` list into a tree. Note that slice 90's schema deliberately does **not** validate that `parentId` names an existing node — placement is this module's concern, by design — so a dangling `parentId` is a case you must handle, not one that cannot reach you (stable sibling order by `order` then `id`; a node whose `parentId` names a missing node is re-rooted rather than dropped; a parent cycle is broken at the first repeat rather than recursing forever). `visibleRows(tree, collapsed)` → a flat, ordered list of `{ node, depth, hasChildren, collapsed }`.
- **`src/contexts/gantt/domain/blocked.ts`** — `blockedStateFor(chart)` → `ReadonlyMap<nodeId, 'none' | 'blocked' | 'unresolvable'>`. A node is `blocked` when some node with an edge **into** it is not `Done`; `unresolvable` when it is a member of a cycle. Never stored, always derived.
- **`src/contexts/gantt/domain/cycles.ts`** — `findCycles(chart)` → the cycles as ordered node-id lists, plus the set of edge ids participating. Must terminate on self-edges and on multiple overlapping cycles.
- **`src/contexts/gantt/domain/progress.ts`** — `progressFor(tree)` → per node, the `Column` distribution of its **leaf descendants** (a leaf is its own distribution), plus `{ done, total }`. A node with no dated/undated distinction here — progress is about `column` only.
- **`src/contexts/gantt/domain/child-span.ts`** — `childSpanFor(tree)` → per node, `{ start, end } | null` from **dated descendants only**, and an `overflow` flag when the child span exceeds the node's own declared span on either side.
- **`src/contexts/gantt/view-model/gantt-layout.ts`** — `layout(chart, opts)` with the signature in the PRD, returning `{ ticks, rows, bars, childSpans, arrows, cycles, needsAttention }`.
  - `ticks` from the zoom level — `week` (day labels), `month` (week numbers), `quarter` (month names) — plus the `today` marker position. The axis domain is the chart's dated extent padded to whole units of the zoom.
  - `bars` carry `x`, `width`, `column`, `blocked` for every **dated** row. An undated row produces no bar and is marked `undated` on the row.
  - `arrows`: for each edge, re-anchor each endpoint that is not in the visible row set to its **nearest visible ancestor**; drop an arrow whose endpoints re-anchor to the same node; merge arrows that re-anchor to the same ordered pair into one carrying `count`. Mark an arrow `inCycle` when its edge id participates in a cycle.
  - `needsAttention`: `{ undated, unplacedAtRoot, orphaned }` counts plus the ids, so one header can state all three (ADR-0012 §4).
  - `visibleRange` narrows which rows are _returned_, while arrow re-anchoring still walks the whole tree — windowing must not change what an arrow points at.
- **`src/contexts/gantt/view-model/gantt-state.ts`** — the collapse / info-band / zoom reducer as `(state, event) → state` with `ts-pattern` exhaustive matching, plus `initialGanttState(chart)` choosing the coarsest zoom whose extent fits and collapsing nothing. No persistence here — slice 92's presenter owns `localStorage`.
- **`src/contexts/gantt/domain/index.ts`**, **`view-model/index.ts`** — barrels, following `contexts/explain`'s.
- **`.dependency-cruiser.cjs`** — the three new rules named in the PRD, copying the wording style of the `explain-*` rules.

## Acceptance criteria

- [ ] Table-driven tests cover: a three-deep tree; a node whose `parentId` is missing (re-rooted); a parent cycle (broken, does not hang); stable sibling order.
- [ ] `visibleRows` under a collapse set returns only reachable rows, with correct `depth`.
- [ ] `blockedStateFor`: a node behind an unfinished blocker is `blocked`; behind a `Done` blocker is `none`; in a cycle is `unresolvable`.
- [ ] `findCycles` terminates and names the loop for: a 2-cycle, a 3-cycle, a self-edge, and two overlapping cycles.
- [ ] `progressFor` returns `{ done: 7, total: 11 }` for a fixture with that shape, counts **leaf** descendants only, and treats a childless node as its own distribution.
- [ ] `childSpanFor` ignores undated descendants, and flags `overflow` when children exceed the parent's declared window on either side.
- [ ] `layout` arrow cases: both endpoints visible (plain arrow); one collapsed (re-anchored to its visible ancestor); both inside the same collapsed parent (**dropped**); three edges collapsing to one pair (**merged with `count: 3`**); an edge in a cycle (`inCycle: true`).
- [ ] `layout` with a narrowed `visibleRange` returns fewer rows but **identical arrow endpoints** to the unnarrowed call for the rows it does return.
- [ ] Each of the three zooms produces its own tick vocabulary and the today marker lands inside the axis when today is in range.
- [ ] An undated node appears as a row with no bar, and is counted in `needsAttention.undated`.
- [ ] `gantt-state.ts` reducer is exhaustive over its event union (removing an arm is a type error).
- [ ] **`grep -rn "from 'react'" src/contexts/gantt/domain src/contexts/gantt/view-model` returns nothing.**
- [ ] `pnpm depcruise` passes with the three new rules in place.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` pass.

## Blocked by

- [90 — The chart contract and its store](./90-gantt-contract-and-store.md)

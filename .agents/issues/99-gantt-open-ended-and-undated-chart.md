# 99 — Open-ended bars, and a chart that admits it has no dates

**Type:** AFK

## Parent

[The Gantt View PRD](../prds/gantt-view.md) · [ADR-0012 §4, §10](../../docs/adr/0012-gantt-charts-as-a-system-of-record.md)

## Why

Two rendering gaps the `HDR-20708` chart exposed, both of which made a correct data state look like a broken screen.

1. **A lane with a start and no end renders as "no dates".** `datedSpanOf` requires both, so a ticket that demonstrably began on a known day shows nothing. Issue 98 seeds a `start` for in-flight work and deliberately leaves `end` null, so without this that chart gains 8 lanes' worth of known starts and still draws 8 blank rows.
2. **A chart where nothing is dated renders as an empty grid.** 29 of 29 undated drew an axis, a today line and 29 empty rows — a reader reasonably reads that as a broken chart rather than as a chart waiting for someone to date it. "Needs attention · 29 undated" was present and far too quiet.

## What to build

- **`src/contexts/gantt/domain/child-span.ts`** — `datedSpanOf` keeps its meaning (both ends known). Add `openSpanOf(node)` → `{ start, end: null }` for a node with a start and no end, so the two states are distinguishable rather than collapsed into "undated".
- **`src/contexts/gantt/view-model/gantt-layout.ts`** — a bar for a node with `start` and no `end`, running from its start to **the axis's today** (or to the axis end when today is past it), marked `openEnded: true`. A row is only `undated` when it has **no start at all**; `needsAttention.undated` keeps that stricter meaning, and gains `openEnded` as its own count so the header can distinguish "nobody knows when this starts" from "nobody has forecast when this ends".
  - The axis extent must include an open-ended bar's start, or a chart of only in-flight work would have no domain.
- **`src/contexts/gantt/view/GanttBar.tsx`** — an open-ended bar is visually unterminated: it fades out at its right edge (a gradient mask) rather than ending in the hard edge every other bar has. It must not read as a bar that happens to end today, because that would be asserting a forecast nobody made. Keep the column tone.
- **`src/contexts/gantt/view/NeedsAttention.tsx`** — report `openEnded` beside `undated`, with wording that tells them apart ("8 in flight, no forecast end").
- **`src/contexts/gantt/view/GanttChartView.tsx`** — when a chart has **no dated lane at all**, a banner above the grid saying so and naming the remedy, in the shape `CycleWarning` already establishes: the chart is readable, nothing is wrong with it, and the next step is to ask an agent to date it. Mention the `POST /charts/:id/dates` verb by name — a reader who sees the banner should know what to ask for.

Styling: read `src/design-system/` and `CycleWarning.tsx` before writing a class. No new colour literals.

## Acceptance criteria

- [ ] `openSpanOf` distinguishes start-without-end from fully undated; `datedSpanOf` is unchanged (its existing tests must pass untouched).
- [ ] `layout` produces an open-ended bar from start to today, flagged `openEnded`, and includes its start in the axis extent — asserted by a chart whose only dated lane is open-ended.
- [ ] Today being **before** an open-ended start, and **after** the axis end, are both covered.
- [ ] A row with no start at all is still `undated`, still counted in `needsAttention.undated`, and still draws no bar.
- [ ] `needsAttention` counts `openEnded` separately from `undated`.
- [ ] A chart with nothing dated shows the banner; a chart with one dated lane does not.
- [ ] Visual check against the real `~/.clashboard/gantt/hdr-20708-user-groups` chart **after** issue 98 has dated it — the 16 Done lanes have terminated bars, the 8 in-flight lanes have open-ended ones, the 5 TO DO lanes say "no dates". Screenshot it. If 98 has not landed yet, hand-write dates into a throwaway chart instead and **do not modify the real one**.
- [ ] `pnpm typecheck`, `pnpm lint` (zero new warnings), `pnpm test`, `pnpm depcruise`, prettier all pass.

## Trap

No React import may appear in `src/contexts/gantt/domain/` or `view-model/` — `gantt-view-model-only-imports-kernel-and-domain` enforces it and ADR-0003 is the reason. The geometry belongs in `layout`, not in the component.

## Blocked by

—

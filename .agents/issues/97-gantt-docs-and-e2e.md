# 97 — Documentation and e2e

**Type:** HITL

## Parent

[The Gantt View PRD](../prds/gantt-view.md) · [ADR-0012](../../docs/adr/0012-gantt-charts-as-a-system-of-record.md)

## What to build

The documentation the architecture claims depend on, and the end-to-end coverage.

- **`src/contexts/gantt/CONTEXT.md`** — new. Read `src/contexts/explain/CONTEXT.md` first; match its structure (a framing paragraph, **Language**, **Use-cases**, an _Avoid_ list) and its density — terms defined with the reason they are that way, not a glossary of restatements. Terms to define: **Chart**, **Node** (and the mirrored/owned field split), **Edge**, **Column** as this context uses it, **blocked** / **unresolvable**, **child span** and **overflow**, **Needs attention**, **the layout function**, **re-anchoring**, **the tray**, **one writer**. _Avoid_: "task" for a node, "progress" as a percentage, "delete" for archive, "sync" for the initial import.
- **`CONTEXT-MAP.md`** — a **Gantt** row in the contexts table; the cross-context coordination list gains the two URL hand-offs (`g` into `/gantt?node=`, and a jira row into `?issue=`) under the existing note that a URL already expresses them; and **the headline claim is amended** per ADR-0012 §1 — "a viewer, not a system of record" becomes "a viewer of other systems' records, and the system of record for the plan that spans them", with the exception scoped to this context.
- **`README.md`** — the context list and the folder layout gain Gantt; the architectural-claims list gains the layout function as the clearest evidence for the framework-free view-model claim (ADR-0003), since it is.
- **`docs/adr/0006-binary-stream-api-routes.md`** — the two amendments ADR-0012 states, as an amendment blockquote at the top in the style ADR-0009 uses: a **third consumer arm** ("consumed by an external process as a documented URL contract") in "When to use this layer", and **body shape follows the consumer** in "Error mapping".
- **`docs/adr/0009-explain-surface-and-long-running-agent-runs.md`** — a one-line note on §1(b) that its fourth-surface trigger fired, was examined, and was declined with reasons in ADR-0012 §2, and that the trigger is re-aimed at "a surface needing chrome state another surface also needs".
- **`pnpm docs:arch`** — regenerate `docs/architecture.svg`.
- **e2e** — `tests/e2e/gantt/` per ADR-0001 (MSW at the HTTP boundary, never a stubbed module). Specs:
  - `chart-renders.spec.ts` — a fixture chart renders its tree, bars, axis and arrows.
  - `collapse-and-arrows.spec.ts` — collapsing re-anchors arrows and merges them with a count.
  - `info-band.spec.ts` — the band opens collapsed-by-default, caps its height, and opens full.
  - `needs-attention.spec.ts` — undated, unplaced and orphaned counts render.
  - `detail-panel-over-chart.spec.ts` — clicking a jira row opens the panel and ⌘K still works.
  - `palette-show-in-gantt.spec.ts` — `g` from a ticket reveals its node.
  - `api-contract.spec.ts` — the REST surface over the real server: create a chart, add nodes and an edge, patch a date, read it back, and assert `DELETE /charts/:id` is **not** routed.

Where a spec needs a chart on disk, use the committed fixture from slice 92 — do not write to the developer's real `~/.clashboard/`.

## Acceptance criteria

- [ ] `contexts/gantt/CONTEXT.md` exists and defines every term listed, each with its reason, plus the _Avoid_ list.
- [ ] CONTEXT-MAP has a Gantt row, the two hand-offs noted, and the amended headline claim with the exception scoped.
- [ ] README lists the context, the folder, and the layout function as evidence for ADR-0003.
- [ ] ADR-0006 carries both amendments as a header blockquote; ADR-0009 §1(b) carries the trigger note.
- [ ] `docs/architecture.svg` regenerated.
- [ ] Every e2e spec above exists and passes; no spec writes to the real home directory.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm depcruise`, `pnpm test`, `pnpm test:e2e` pass.

## Blocked by

- [94 — The SKILL and the copy button](./94-gantt-skill-and-copy-button.md)
- [96 — Hand-offs and archive](./96-gantt-handoffs-and-archive.md)

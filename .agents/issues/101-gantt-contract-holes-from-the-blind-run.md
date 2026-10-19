# 101 — Three contract holes a blind agent run exposed

**Type:** AFK

## Parent

[The Gantt View PRD](../prds/gantt-view.md) · [ADR-0012 §3, §5, §6, §8](../../docs/adr/0012-gantt-charts-as-a-system-of-record.md)

## Why

An agent was handed nothing but the copied SKILL and asked to build a chart for epic `HDR-20708` — the same epic whose first attempt produced 29 undated lanes. It succeeded: 31 lanes, 29 fully dated, 54 edges, 15 bodies. In doing so it found three holes that are **code**, not documentation.

## 1. `createEdge` cannot detect a duplicate dependency

`mutate-chart.ts`'s `createEdge` rejects a duplicate edge **`id`** and nothing else. Because bootstrap already mirrors every Jira link as an edge — 53 of them on this chart — an agent that declares the dependencies it read from the epic will POST them under **its own ids**, every one will be accepted, and the dependency graph will silently double. No `409`. Duplicated arrows then inflate the merge count on a collapsed chart and make `blocked` and cycle detection answer over a graph nobody wrote.

- **Reject a duplicate `from`/`to` pair** with `DuplicateEdgeId` (the pair _is_ the identity of a dependency; the id is just its handle). The error message must name the existing edge's id, so an agent can tell "already declared" from "name collision" and move on rather than retrying.
- A `local` edge whose pair already exists as a `jira` edge is the common case here and must be rejected the same way — ADR-0012 §6's promotion rule already says one pair is one edge.
- Tests: duplicate pair rejected; reversed pair (`to`/`from` swapped) **accepted**, since `A blocks B` and `B blocks A` are a cycle and §6 says cycles are recorded, not refused; duplicate id still rejected; the message names the incumbent.

## 2. `hasBody` is absent from two of the three chart responses

`loadChart` returns `GanttNodeView` (`GanttNode & { hasBody }`), but `POST /charts` and `POST /charts/:chartId/dates` return the raw `GanttChart` straight from their application services. The key is not `false` — it is **missing**, so an agent that treats either response as a chart read sees `undefined`. The SKILL promises a chart read carries it.

- Every route that answers with a whole chart answers with the **same shape**. Route the bootstrap and dates responses through the same `hasBody` derivation `loadChart` uses rather than duplicating it.
- Test: all three responses agree on the presence and the value of `hasBody` for the same chart. Assert the key exists and is `false`, not merely that it is falsy.

## 3. A blocker outside `jiraSources` cannot be modelled honestly

The real release gate for this epic (`HDR-19244`) lives in a **different** epic. A `jira` node for it is accepted today, but `reconcile` orphans any jira node absent from the discovery search — so the next sync would flag the chart's single most load-bearing lane as having _left the epic_, which is a lie. The agent worked around it with a local lane whose status it hand-copied, which goes stale silently and forever. Cross-epic blockers are the normal case for a front-end epic waiting on a backend.

- A node gains a flag recording **whether its key has ever been returned by a discovery search** for this chart (name it for what it means — `discovered`, `inEpic`, or similar — and say so in a comment). Default `false`.
- `reconcile` sets it `true` for any node whose key the search returned, and **orphans only nodes where it is `true`**. A key that was never in scope can never be reported as having departed.
- A node created directly through `POST /nodes` with a jira key therefore starts `false`: sync **mirrors** its title, status and assignee (it is a real ticket — mirroring is `getIssue`, not discovery) and never orphans it. If a later search does return that key, the flag flips to `true` and it becomes orphan-eligible from then on.
- This is a schema addition. Existing charts on disk have no such field — decide whether it is optional-with-a-default or written on read, and make sure the two real charts under `~/.clashboard/gantt/` still parse. **`readChart` treats an invalid chart as absent, so a migration that fails makes a chart vanish rather than error** — there is a test for that shape in `gantt-store.test.ts`; add one for this.
- Tests: a never-discovered jira node survives a sync that returns nothing, with mirrored fields refreshed and `orphaned` still false; a discovered node that later disappears is still orphaned; the flag flips on first discovery.

## Acceptance criteria

- [ ] Every item above has a test, and **each test is checked by breaking what it guards and watching it fail**. Report what you saw for each.
- [ ] `~/.clashboard/gantt/hdr-20708-user-groups/chart.json` and `acceptance-probe/chart.json` both still load in the running app after the schema change. **Back both up first and say where.**
- [ ] The duplicate-pair rejection is verified live with `curl` against a chart that already has mirrored edges.
- [ ] `pnpm typecheck`, `pnpm lint` (zero new warnings, baseline 33/0), `pnpm test`, `pnpm depcruise`, prettier, and `npx playwright test tests/e2e/gantt/` all pass.
- [ ] ADR-0012 §6 notes that a dependency's identity is its endpoint pair, and §5 notes the narrowed orphan rule.

## Trap

Any `@effect/vitest` test with an Effect body **must** be `it.effect(…)`; a plain `it` hands vitest an un-run Effect and every assertion silently passes. Do not copy `src/server/contexts/watchlist/application/*.test.ts` — those two files still have the bug. Use `src/server/contexts/review/application/load-review-cards.test.ts`.

## Blocked by

—

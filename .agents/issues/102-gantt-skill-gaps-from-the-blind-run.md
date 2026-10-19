# 102 — Eight SKILL gaps the blind run reported

**Type:** AFK

## Parent

[The Gantt View PRD](../prds/gantt-view.md) · [ADR-0012 §4, §5, §6](../../docs/adr/0012-gantt-charts-as-a-system-of-record.md)

## Why

A blind run — an agent given nothing but the copied SKILL and the epic `HDR-20708` — built a good chart and then reported, bluntly, what it had to guess at. The dating section worked ("without it I would have built the 29-undated-lanes chart it describes"). These are the gaps it found around it. Issue 101 fixes the three that were code; these eight are the document's.

Read the whole SKILL first and match its register. Every claim you write must be true of the code — check it, do not take it from this issue.

1. **Chart creation also creates edges, and the document never says so.** Bootstrap is described as "one mirrored node per discovered ticket, flat and undated"; it also mirrored **53 Jira issue links as edges**. The agent only noticed because it printed the edge array. Say it in the "Create a chart" section, and say what `sync` does to mirrored edges afterwards (it adds links that appear and removes ones that vanish, but only when **both** endpoints were in the search; a local edge is never removed). Issue 101 makes a duplicate `from`/`to` pair a `409` — document that too, so an agent reads it as "already declared" rather than retrying.

2. **Where estimates actually live.** §5 says "use the estimate the ticket carries, if it carries one". On this epic **no ticket carries one** — `timeoriginalestimate`, `timeestimate` and story points are null on every one. Every estimate came from a markdown table inside the **epic's own description**, which also held the grouping and the entire blocked-by matrix, and which the SKILL never mentions reading. Tell the agent to read the epic description first, and warn that `acli jira workitem view --json` returns **ADF, not text** — the agent had to write an ADF-to-text renderer before it could read the one document that mattered.

3. **A forecast end that lands in the past.** For 3 of 4 in-flight lanes, start + estimate × velocity put the end _before today_ on a ticket demonstrably unfinished. The SKILL is silent and the agent invented a rule. Give one. And state the harder truth it exposed: `/dates` reads only _first out of TO DO_ and _first into Done_, so for a ticket sitting in code review the remaining effort is **unobservable from the only data source this document endorses** — which is exactly where an agent will fabricate. Tell it to say so in the body rather than produce a confident number.

4. **The HDR-20945 worked example is stale and teaches the wrong reflex.** It tells the agent to declare an edge for "Start this ticket after the full PRD of HDR-20708 is implemented and released" — **that edge already exists from bootstrap** (`hdr-20933 → hdr-20945`), so following it literally yields a duplicate. Worse, on this epic all 53 Jira links reconciled exactly with the PRD's blocked-by column, so the lesson "look for prose dependencies between tickets" found nothing — while the dependency that genuinely was missing was a blocker **in another epic**. Replace the example with that one.

5. **Scheduling must not overwrite observed history.** §4's "a lane starts no earlier than the latest `end` of everything with a `blocks` edge into it" reads as an invariant of the chart. Six arrows on the finished chart violate it, all between history-dated Done lanes, and all correct — the epic itself says "C1–C3 can start on the F1 branch as soon as the types are stable, before F1 merges". Scope the rule explicitly to **forward** scheduling, and say that observed dates win: a seeded date is a measurement, and an agent that "fixes" it has corrupted the record.

6. **A cross-epic blocker.** Issue 101 makes this legal: a `jira` node whose key is outside `jiraSources` is mirrored like any other ticket and is **never** orphaned, because sync only orphans keys a discovery search has actually returned. Document the pattern — it is how a front-end epic models the backend gate it waits on, and the agent needed it and had to invent a lossy substitute.

7. **A parent lane's own `column` is not drawn.** A lane with children renders its descendants' distribution; its declared `column` is ignored by the renderer (`GanttBar.tsx` tones only leaves). The agent set one on six group lanes with no rule to apply and wrote "In Implementation" on a lane with nothing in implementation. Say plainly that the field is required, that a parent's value is not rendered, and that the honest thing is not to agonise over it.

8. **The smaller ones.** (a) "Placed by Jira's parent as a one-time suggestion" does nothing for the documented single-epic case — every node came back `parentId: null`, because the parent is the epic and the epic is not a node; say so rather than implying grouping arrives free. (b) `§6`'s "declare the window you actually mean" has no fallback when there is **no baseline at all** — no sprint dates, no due dates — in which case the declared window can only be the child span and the overflow underlay is inert; say what to do. (c) `snapshotted: false` in the body response is undocumented; only `true` is explained.

## Acceptance criteria

- [ ] All eight addressed, each verified against the code rather than against this issue.
- [ ] The stale HDR-20945 example is **gone**, replaced by the cross-epic blocker.
- [ ] A test pins the new claims that would fail silently if dropped — at minimum that bootstrap-creates-edges and the forward-only scheduling scope are stated. **Prove each new test has teeth** by deleting what it guards and watching it fail. Report what you saw.
- [ ] `pnpm typecheck`, `pnpm lint` (zero new warnings), `pnpm test`, prettier (including `*.md`), and `npx playwright test tests/e2e/gantt/` all pass.

## Blocked by

- [101 — Three contract holes a blind agent run exposed](./101-gantt-contract-holes-from-the-blind-run.md)

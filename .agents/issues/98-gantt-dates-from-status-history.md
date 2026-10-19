# 98 — Dates from status history

**Type:** AFK

## Parent

[The Gantt View PRD](../prds/gantt-view.md) · [ADR-0012 §4](../../docs/adr/0012-gantt-charts-as-a-system-of-record.md)

## Why

A real chart built from `HDR-20708` arrived with 29 lanes, 24 of them correctly parented, 53 edges reconciled from `issuelinks` — and **`start: null, end: null` on every single one**. The agent did nothing wrong: the SKILL teaches the date _format_ and never says where a date comes from, and ADR-0012 §4(d) explicitly **rejected** deriving dates from status history.

That rejection was wrong, and the chart proves it. Of those 29 lanes, 16 are Done, 5 In Code Review and 3 In Implementation — **24 have already started**, and for work that has happened, the transition history is not retrospective trivia, it is the only truthful source there is. Only 5 are genuinely future.

It also cannot be pushed onto the agent: clashboard holds the Jira credentials and the agent does not, and `acli jira workitem view --json` returns no transitions.

## What to build

- **`src/server/gateways/jira/port.ts` + `http-adapter.ts` + `types.ts`** — `getIssueChangelog(key)` → the status transitions for one issue, as `{ at: string; from: string | null; to: string }[]`, oldest first. Jira: `GET /rest/api/3/issue/<key>?expand=changelog`, reading `changelog.histories[].items[]` where `field === 'status'`. Follow the existing gateway shape exactly: a `Schema`-decoded response in `types.ts`, the method on the port, the adapter implementation, and table-driven `it.effect` tests against a faked `HttpClient`. Jira caps inline changelog at 100 entries and exposes the rest via a separate endpoint — a status history longer than that is not worth paging for, so take what is inline and say so in a comment.
- **`src/server/contexts/gantt/domain/history-dates.ts`** — new, **pure**. `spanFromHistory(transitions, { today })` → `{ start: string | null; end: string | null }`.
  - `start` is the date of the **first** transition into a status whose `columnForStatus` is not `'TO DO'`. Work began when it stopped being to-do.
  - `end` is the date of the **first** transition into a status whose column is `'Done'`. First, not last: a ticket that bounced back out of QA and in again was finished the first time by any reading a reader cares about, and "last" would make a reopened ticket look like it took months.
  - Still in flight → `end: null`. Do **not** substitute today: a forecast is the agent's job (issue 100) and the view renders an open-ended bar (issue 99).
  - Never started → both `null`.
  - Dates are the UTC calendar date of the transition instant, `YYYY-MM-DD`.
  - Status comparison goes through `columnForStatus`, which is already case-insensitive — this chart has `IN CODE REVIEW`, `IN IMPLEMENTATION`, `In QA` and `IN UAT` in one dataset, so casing is not hypothetical.
- **`src/server/contexts/gantt/application/seed-dates.ts`** — new. `seedDatesFromHistory(chartId, writes)`:
  - Reads the chart, selects nodes that are `source.kind === 'jira'` **and** have a `null` `start` or `end`, and asks Jira for each one's changelog. **Bounded concurrency** (`Effect.forEach` with a `concurrency` of about 5) — 24 sequential round-trips is a visible stall and 24 parallel ones is rude to Jira.
  - **Fills only nulls.** A node whose `start` is already set keeps it, even if history disagrees: dates are chart-owned (ADR-0012 §3) and this only fills blanks. This is what makes the verb safe to re-run and what stops it fighting the agent.
  - One changelog entry, `actor: 'sync'`, naming the counts (`dated 24 lanes · 5 had no history · 3 still in flight`).
  - Inside `withChartLock`, re-reading the chart inside the critical section exactly as `sync-chart.ts` does.
  - A ticket Jira cannot answer for is **skipped**, not fatal: one unreachable issue must not cost the other 23 their dates. Count them separately.
- **`src/routes/api/gantt.charts.$chartId.dates.ts`** — `POST /api/gantt/charts/:chartId/dates`. `503` when Jira is unreachable for the chart as a whole, `404` unknown chart, `200` with the updated chart.
- **`src/server/server-functions/gantt.ts`** + **`src/coordinator/gantt-hooks.ts`** — `seedGanttDates` / `useSeedGanttDates`, invalidating the chart and its changelog.
- **`docs/adr/0012-…` §4** — amend. §4(d) ("Actual, from status history") was rejected with the reason "answers where the time went, not where the project is going". Record that the rejection held for the _forecast_ and failed for the _record_: a chart of mostly-finished work has no other truthful source, and the amendment is scoped — history seeds blanks, it never overwrites, and it never invents an end for work still in flight.

## Acceptance criteria

- [ ] `getIssueChangelog` decodes a real-shaped Jira response, returns transitions oldest-first, and maps each gateway failure to the existing tagged errors. Table-driven `it.effect` tests (**`it.effect`**, not `it` — see the trap below).
- [ ] `spanFromHistory` is pure and table-driven over: never started; started and finished; started, finished, reopened and finished again (asserts **first** Done wins); in flight (start, `end: null`); mixed casing (`IN UAT`, `In QA`); a transition into a status the column map does not know (treated as `TO DO`, i.e. not a start).
- [ ] `seedDatesFromHistory` fills only nulls — a test sets `start` by hand, disagrees with history, and asserts the hand-set value survives.
- [ ] A node Jira cannot answer for is skipped and counted; the other nodes are still dated and still written.
- [ ] Exactly one changelog entry per run, naming the counts.
- [ ] Concurrency is bounded, asserted by a fake gateway that records peak in-flight calls.
- [ ] `POST /charts/:chartId/dates` maps `404` / `503` / `200`, with a route-handler test per code.
- [ ] Running it against the real `hdr-20708-user-groups` chart dates **24 of its 29 lanes** and leaves the 5 TO DO lanes undated. Report the actual numbers.
- [ ] `pnpm typecheck`, `pnpm lint` (zero new warnings), `pnpm test`, `pnpm depcruise`, prettier all pass.

## Trap

Any test using `@effect/vitest` with an Effect body **must** be `it.effect('…', () => Effect.gen(…))`. A plain `it` hands vitest an un-run Effect and every assertion inside silently passes — this already cost 39 dead assertions in this feature. Do **not** copy `src/server/contexts/watchlist/application/*.test.ts`; those two files still have the bug. Use `src/server/contexts/review/application/load-review-cards.test.ts`.

## Blocked by

—

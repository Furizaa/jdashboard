# 44 — E2e: board folder specs

**Type:** AFK

## Parent

[E2e harness PRD](../prds/e2e-harness.md)

## What to build

Five scenario specs covering the board feature folder. Each spec walks a user-visible board flow end to end against the World seeded by the test.

- `tests/e2e/board/columns.spec.ts` — seed issues with each Jira status the PRD's status mapping covers (`Reviewed`, `Blocked`, `In Implementation`, `In Code Review`, `In STG`, `In QA`, `In UAT`, `Done`); assert each card lands in the expected column. Drives the status→column mapping through the rendered board.
- `tests/e2e/board/polling.spec.ts` — render the board; mutate the World to add/remove/change issues; advance `page.clock` by 60s; assert the new state is visible. Uses `page.clock.fastForward('60s')`.
- `tests/e2e/board/visibility-pause.spec.ts` — render the board; dispatch `visibilitychange` to hidden via `page.evaluate`; advance clock 120s; assert no refetch occurred (e.g. via the sync indicator's "Synced … ago" not advancing). Then dispatch back to visible; assert an immediate refetch.
- `tests/e2e/board/search.spec.ts` — render with multiple issues; use `Cmd+K` to focus search, type a query, assert filtered list; press `Esc` to clear, assert full list returns. Asserts on user-visible card presence, not internal filter state.
- `tests/e2e/board/sync-indicator.spec.ts` — assert "Synced Ns ago" updates as time advances; assert manual refresh button invalidates the board (mutate World, click refresh, assert new state without waiting for poll); register a one-shot 5xx override for the next search and assert the indicator switches to its failed state with a tooltip.
- Extend `World`/handlers as needed: ability to mutate the seeded issue set between polls; ability to model "next search response is a 5xx" via a one-shot override hook (this issue introduces the override mechanism's read-side; mutation overrides are introduced in slice 46).
- Extend `src/lib/testids.ts` and components only with what the specs require: `syncIndicator`, `refreshButton`. Roles + accessible names ("Refresh", `getByRole('status')`-style for the indicator) preferred where they suffice.
- No changes to `src/features/board` source under test except adding the testids above. The point of the harness is to pin existing behaviour, not to refactor it.

## Acceptance criteria

- [ ] `pnpm test:e2e` runs all five board specs and they pass on a clean checkout.
- [ ] Each spec asserts user-visible state (card key + status text, sync indicator text, search result counts) — not DOM internals.
- [ ] Polling spec runs in under 2 seconds (proves `page.clock` is correctly intercepting the polling interval).
- [ ] Visibility-pause spec confirms zero search/board refetches occur between hidden and visible by inspecting MSW request logs (or equivalent).
- [ ] Sync indicator failure path produces the same red `Sync failed · Retry` UI a user sees with a real 5xx — not a generic network error.
- [ ] No structural CSS selectors used. New testids are added via `src/lib/testids.ts` only.
- [ ] `pnpm typecheck` and `pnpm lint` pass.

## Blocked by

- 43 — E2e tracer bullet

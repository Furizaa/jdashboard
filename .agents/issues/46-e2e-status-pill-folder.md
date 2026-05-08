# 46 — E2e: status-pill folder specs (introduces one-shot overrides + transition state)

**Type:** AFK

## Parent

[E2e harness PRD](../prds/e2e-harness.md)

## What to build

Two scenario specs covering the status-pill feature folder, plus the one-shot override mechanism on the MSW sidecar (used here and reused by slice 50).

- Extend `World` with transition state:
  - `seedTransitions(issueKey, transitions[])` — set the allowed transitions returned by `GET /issue/:key/transitions`.
  - `transitionIssue(issueKey, transitionId)` — apply a transition to the seeded issue. Returns the new status. Subsequent reads see the new status.
  - Default behaviour when transitions are not explicitly seeded: derive from the existing transition resolver's expected map (or seed a sensible default in `seedBaselineWorld`).
- Extend MSW handlers: `GET /issue/:key/transitions`, `POST /issue/:key/transitions`. Both dispatch to the World.
- Add the one-shot override mechanism: `mocks.failNext('POST /issue/:key/transitions', { status: 400, body: { errorMessages: ['Workflow violation'] } })`. The override fires on the next matching request and reverts. Implementation lives in `tests/e2e/mocks/server.ts` and is extended (not replaced) by later slices.
- `tests/e2e/status-pill/transition-happy-path.spec.ts` — seed an issue in `Reviewed` with transitions to `In Implementation`; click the pill, assert the dropdown lazy-fetches transitions (verify via MSW request log); pick `In Implementation`; assert optimistic update (card shows new status before the POST resolves); allow request to complete; assert the issue is refetched (via MSW request log); assert the card now shows the server-confirmed status.
- `tests/e2e/status-pill/transition-failure.spec.ts` — register `mocks.failNext('POST /issue/:key/transitions', { status: 400, body: { errorMessages: ['Workflow violation'] } })`; click the pill and pick a transition; assert the optimistic update appears briefly; assert the card rolls back to the original status; assert a Sonner toast surfaces "Workflow violation". Register `mocks.failNext('GET /issue/:key/transitions', { status: 500 })` and assert the dropdown surfaces a fetch error gracefully.
- Extend `src/lib/testids.ts` only as needed: `statusPill`, `statusPillDropdown`. Roles preferred where they suffice (the dropdown is likely a `role="menu"` already).
- No source-under-test changes beyond testid additions.

## Acceptance criteria

- [ ] Both specs pass on a clean checkout.
- [ ] Happy-path spec proves the lazy fetch happened by inspecting MSW request logs (the `GET /transitions` must appear after the click, not before).
- [ ] Failure spec rollback assertion observes both states in order (optimistic → rolled-back), not just the final state.
- [ ] Sonner toast assertion uses `getByRole('status')` or the `sonner`-provided role, not a CSS selector on the toast container.
- [ ] One-shot override mechanism is exposed on the test fixture's `mocks` handle and documented in `tests/e2e/README.md`.
- [ ] After an override fires once, the next matching request hits the default world-backed handler — verified by a follow-up assertion in the failure spec.
- [ ] World's `transitionIssue` mutation is visible to the refetch — the post-success refetch returns the new status without separate handler wiring.
- [ ] `pnpm typecheck` and `pnpm lint` pass.

## Blocked by

- 43 — E2e tracer bullet

# 80 — Effect server: `TransportError` tag + concurrency cap parity + `Schedule.compose` comment

**Type:** AFK

## Parent

[Effect server hardening PRD](../prds/effect-server-hardening.md)

## What to build

Three small policy-parity changes that travel together because they all touch the runtime / gateway middleware seam:

1. Split `Rejected` into `Rejected` (4xx with body — Jira/GitLab actively said no) and `TransportError` (network failure, encoding failure, decode failure — the request never got a meaningful answer). Per-context error unions decide which to surface and which to demote.
2. Cap the inner per-MR fan-out so the runtime concurrency budget matches CONTEXT-MAP.md's documented "5 at the application-service level."
3. Annotate the `Schedule.compose(Schedule.recurs(N))` retry-cap pattern in `app-layer.ts` with a one-line comment explaining what compose does there.

Concretely:

- **`src/server/gateways/jira/errors.ts`** and **`src/server/gateways/gitlab/errors.ts`**:
  - Add `TransportError extends Schema.TaggedError<TransportError>()('TransportError', { message: Schema.String })`. Wire `_tag` is the un-prefixed `'TransportError'` per the existing convention; the class name is gateway-prefixed.
  - The `JiraGatewayError` / `GitlabGatewayError` type unions grow to include `TransportError`.
  - Update the un-prefixed-tag explainer comment to mention `TransportError` alongside `Unauthorized` / `NotFound` / `Rejected`.
- **`src/server/gateways/jira/http-adapter.ts`** and **`src/server/gateways/gitlab/http-adapter.ts`**:
  - The `Effect.mapError` wrapping `client.execute(...)` for transport failures now produces `TransportError` instead of `JiraRejected` / `GitlabRejected`.
  - In Jira's `postJson`, the body-encoding `Effect.mapError` likewise produces `JiraTransportError`.
  - The `decodeJsonBody`'s response-parse `Effect.mapError` (today maps `ResponseError` to `JiraRejected`/`GitlabRejected`) now maps to `TransportError`.
  - `failFromStatus` continues to produce `Rejected` — but `Rejected` is now strictly "4xx with body."
  - The `as Effect.Effect<T, GatewayError>` cast stays in this slice; it is removed when Schema bodies land (slices 81/82).
- **`src/server/contexts/*/errors.ts`** — per-context decision on `TransportError`:
  - **`capture/errors.ts`**: `QuickCreateError` becomes `Schema.Union(JiraUnauthorized, JiraRejected, JiraTransportError)` — `TransportError` surfaces to the user (a network blip on quickCreate is actionable).
  - **All other context error unions**: `TransportError` is **not** added to the wire union; the application services demote it to a defect via `dieOn('TransportError')` (from slice 76; if 76 is not merged, use the inline `Effect.catchTag` form). Behaviour at every other call site is unchanged.
- **Application-service updates** wherever `Rejected` was previously demoted to a defect and a `TransportError` should join the demote list:
  - `contexts/board/application/load-board.ts` — demote `TransportError` (today's network-fail-becomes-Rejected-then-defect path is preserved, just under the new tag).
  - `contexts/board/application/load-mr-statuses.ts` — same; demote `TransportError` in the three current sites.
  - `contexts/detail/application/load-issue.ts` — same in both sites.
  - `contexts/detail/application/load-transitions.ts` — same.
  - `contexts/capture/application/load-myself.ts` — `loadMyself`'s wire union currently is just `Unauthorized`. Decide: surface `TransportError` (consistent with `quickCreate`) or demote (consistent with `loadBoard`). Recommend **demote** here — `loadMyself` is read on Capture page mount; a transport failure shows as the page-level error boundary, not as form-level feedback.
  - `contexts/capture/application/load-my-epics.ts` — same as `loadMyself`; demote.
  - `contexts/capture/application/quick-create.ts` — **do not** demote `TransportError`; let it surface (matches `QuickCreateError` schema above).
  - `contexts/review/application/load-review-cards.ts` — demote in all three current sites.
  - `contexts/detail/application/perform-transition.ts` — `PerformTransitionError = Schema.Union(JiraUnauthorized, JiraRejected)`. Decide: include `JiraTransportError` here too (a transition retry with no upstream answer is also actionable). Recommend **surface**.
- **`src/server/gateways/gitlab/mr-fanout.ts`**:
  - Change `Effect.all([...], { concurrency: 'unbounded' })` to `Effect.all([...], { concurrency: 1 })`. Per-MR fan-out becomes sequential. The outer `concurrency: 5` in `loadMrStatuses` and `loadReviewCards` is now the only concurrency budget in flight.
- **`src/server/runtime/app-layer.ts`**:
  - Add a one-line comment above `Schedule.compose(Schedule.recurs(RETRY_ATTEMPTS))` explaining that compose caps the exponential schedule to N retries (so the next reader doesn't have to re-read the Effect docs).
- **Test updates**:
  - `gateways/jira/http-adapter.test.ts`: existing `Rejected` tests stand (4xx-with-body unchanged). New test: a network failure from `fakeHttpClient` (e.g. respond throws) maps to `TransportError`.
  - `gateways/gitlab/http-adapter.test.ts`: same shape.
  - `contexts/capture/application/quick-create.test.ts`: new test asserting `JiraTransportError` propagates as a tagged failure (not a defect).
  - `contexts/board/application/load-board.test.ts`: optionally a test asserting `JiraTransportError` is demoted to a defect (`Exit.isDie`).

## Acceptance criteria

- [ ] `JiraTransportError` and `GitlabTransportError` tagged classes exist; wire `_tag` is `'TransportError'`.
- [ ] Both gateway adapters route network / encoding / decode failures to `TransportError`. `Rejected` is reserved strictly for 4xx-with-body.
- [ ] `gateways/gitlab/mr-fanout.ts` uses `concurrency: 1`.
- [ ] `app-layer.ts` carries the one-line `Schedule.compose` comment.
- [ ] `QuickCreateError` and `PerformTransitionError` include `TransportError`; all other context error unions exclude it (and the corresponding application services demote it via `dieOn('TransportError')` or the inline form).
- [ ] New gateway tests cover the network-failure → `TransportError` path for each gateway.
- [ ] New `quickCreate` test asserts `TransportError` surfaces as a tagged failure.
- [ ] Existing application-service tests pass unchanged after the `dieOn`/catchTag updates.
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm test && pnpm test:e2e` all green.

## Blocked by

None — can start immediately. (Slice 76's `dieOn` is recommended for cleanly applying `dieOn('TransportError')`; if 76 has not merged, use the inline `Effect.catchTag('TransportError', Effect.die)` form.)

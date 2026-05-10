# 82 — Effect server: Schema-validated HTTP bodies (GitLab gateway)

**Type:** AFK

## Parent

[Effect server hardening PRD](../prds/effect-server-hardening.md)

## What to build

Same shape as slice 81, applied to the GitLab gateway. GitLab's adapter has an extra wrinkle: the wire shape (snake_case fields) is mapped to the gateway-output shape (camelCase) via local `toRawX` helpers. Schema decoding lives at the wire-shape boundary; the existing `toRawX` mappers are unchanged.

Concretely:

- **`src/server/gateways/gitlab/http-adapter.ts`** — declare `Schema.Struct` versions of the local `WireX` types co-located with the existing `toRawX` helpers:
  - `WireUserSchema` — `{ username, name }`.
  - `WireMrSummarySchema` — `{ iid, title, web_url, state, draft, updated_at }`.
  - `WireMrDetailSchema` — `WireMrSummarySchema` extended with `{ reviewers, head_pipeline, has_conflicts }`.
  - `WireReviewerSchema`, `WireNoteSchema`, `WireDiscussionSchema`, `WireApprovalsSchema`, `WireReviewerWithStateSchema`.
  - The existing `WireX` type aliases become `type WireX = Schema.Schema.Type<typeof WireXSchema>` so the `toRawX` signatures compile unchanged.
  - GitLab's `state` field is one of `'opened' | 'closed' | 'merged' | 'locked'`; declare as a `Schema.Literal(...)` union — these values come from the GitLab API and breaking on a new state value is the right behaviour (we want to know about it).
  - `head_pipeline` is `{ status: string } | null`; declare with `Schema.NullOr(Schema.Struct({ status: Schema.String }))`. Pipeline status stays `Schema.String` — `ciVisualState` already handles unknown values gracefully.
  - `ReviewerEndpointState` (the reviewer's review-state) is `'unreviewed' | 'review_started' | 'reviewed' | 'requested_changes' | 'approved'`; declare as `Schema.Literal(...)`. New GitLab states should fail loudly so we can assess.
- **Replace `decodeJsonBody<T>`** with the same Schema-aware decoder shape as slice 81's `decodeJsonAs`. Each call site decodes the wire schema and pipes through the existing `toRawX` mapper:
  - `getCurrentUser` → `decodeJsonAs(WireUserSchema)` → `Effect.map(u => ({ username, displayName: u.name }))`.
  - `listMrs` → `decodeJsonAs(Schema.Array(WireMrSummarySchema))`.
  - `getMr` → `decodeJsonAs(WireMrDetailSchema)` → `Effect.map(toRawMrDetail)`.
  - `getMrDiscussions` → `decodeJsonAs(Schema.Array(WireDiscussionSchema))` → `Effect.map(arr => arr.map(toRawDiscussion))`.
  - `getMrApprovals` → `decodeJsonAs(WireApprovalsSchema)` → `Effect.map((wire) => ({ approvedUsernames: ... }))`.
  - `getMrReviewers` → `decodeJsonAs(Schema.Array(WireReviewerWithStateSchema))` → `Effect.map(...)`.
- **The `as Effect.Effect<T, GitlabGatewayError>` cast is gone.**
- **`gateways/gitlab/http-adapter.test.ts`**:
  - Add one decode-failure test per gateway method asserting `TransportError`.
  - Existing 401/404/4xx-with-body tests stand.
  - Existing happy-path tests stand (they implicitly exercise Schema decoding now).
- **No changes** to application services (`load-mr-statuses`, `load-review-cards`) or their tests — the public gateway shape is unchanged.

## Acceptance criteria

- [ ] Every `WireX` type in `gateways/gitlab/http-adapter.ts` is derived from a `Schema.Struct` declaration. The hand-written wire-type aliases are gone.
- [ ] `decodeJsonBody<T>` and the `as Effect.Effect<T, GitlabGatewayError>` cast are removed.
- [ ] Each gateway method uses `decodeJsonAs(<schema>)` for response decoding, followed by the existing `toRawX` mapper where applicable.
- [ ] GitLab `state` and `ReviewerEndpointState` are declared as `Schema.Literal` unions; an unknown enum value produces a `TransportError`.
- [ ] `gateways/gitlab/http-adapter.test.ts` has a decode-failure test per gateway method asserting `TransportError`.
- [ ] Existing application-service tests for GitLab paths (`load-mr-statuses.test.ts`, `load-review-cards.test.ts`, the gitlab `http-adapter.test.ts` happy-path cases) green unchanged.
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm test && pnpm test:e2e` all green.

## Blocked by

- 80 — `TransportError` must exist before decode failures can route to it.

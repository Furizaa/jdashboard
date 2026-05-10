# 81 — Effect server: Schema-validated HTTP bodies (Jira gateway)

**Type:** AFK

## Parent

[Effect server hardening PRD](../prds/effect-server-hardening.md)

## What to build

Redeem the documented commitment in CONTEXT-MAP.md and ADR-0005 that `effect/Schema` validates HTTP response shapes. Today's `decodeJsonBody<T>(response)` casts `unknown → T`; this slice replaces it with `HttpClientResponse.schemaBodyJson(schema)`-backed decoding. Decode failures route to `TransportError` (introduced in slice 80). The `as Effect.Effect<T, JiraGatewayError>` cast disappears.

Concretely:

- **`src/server/gateways/jira/types.ts`** — replace each hand-written `RawX` type with a `RawXSchema = Schema.Struct({...})` declaration; the corresponding type is derived: `export type RawX = Schema.Schema.Type<typeof RawXSchema>`.
  - Schemas to declare:
    - `JiraUserSchema` — `{ accountId, displayName, avatarUrls: Record<string, string> }` (the gateway maps to the public `JiraUser` shape after decoding).
    - `RawSearchResponseSchema` — `{ issues: RawIssue[], nextPageToken?, isLast? }`.
    - `RawIssueSchema` — `{ id, key, fields: { summary, status: { name, statusCategory? }, labels?, issuetype?, parent? } }`. `status.name` stays `Schema.String` (no literal-union tightening — HDR statuses mix ALL-CAPS and Title Case per project memory).
    - `RawDetailedIssueSchema` — same as `RawIssueSchema` plus the detail-only fields (priority, assignee, reporter, description, issuelinks, comment, attachment).
    - `RawAttachmentSchema` — `{ id, filename, mimeType }`.
    - `RawCommentSchema` — `{ id, author?, created, body? }`.
    - `RawIssueLinkSchema`, `RawLinkedRefSchema`, `AllowedTransitionSchema`, `GatewayCreatedIssueSchema` — declared analogously.
  - Use `Schema.optional` and `Schema.NullOr` / `Schema.OrUndefined` where the existing types use `?:` / `| null`.
  - `priority.name` stays `Schema.String` — the `'Undefined'` sentinel must not be rejected by the schema (per `project_jira_priority_undefined.md`); it's normalized later in `loadIssue`'s `pickPriorityName`.
  - `description` and `comments[].body` carry ADF; today's type uses `unknown`. Keep `Schema.Unknown` here — ADF validation is a separate concern; the walker tolerates malformed structures.
- **`src/server/gateways/jira/http-adapter.ts`**:
  - Replace the cast-flavoured `decodeJsonBody<T>` with a Schema-aware variant. One natural shape:
    ```ts
    const decodeJsonAs =
      <A, I>(schema: Schema.Schema<A, I>) =>
      (response: HttpClientResponse.HttpClientResponse): Effect.Effect<A, JiraGatewayError> =>
        HttpClientResponse.schemaBodyJson(schema)(response).pipe(
          Effect.mapError((error) => new JiraTransportError({ message: error.message })),
        )
    ```
  - Each `executeJson<T>(...)` call site passes the relevant schema:
    - `getMyself` → `decodeJsonAs(JiraUserResponseSchema)`.
    - `searchIssues` → `decodeJsonAs(RawSearchResponseSchema)`.
    - `getIssue` → `decodeJsonAs(RawDetailedIssueSchema)`.
    - `getTransitions` → `decodeJsonAs(GetTransitionsResponseSchema)` (a small inline `Schema.Struct({ transitions: Schema.Array(...) })`).
    - `transitionIssue` → continues to use `executeNoBody` (no body to decode).
    - `createIssue` → `decodeJsonAs(CreatedIssueResponseSchema)` (the `{ id, key, self }` shape).
  - The `as Effect.Effect<T, JiraGatewayError>` cast is gone.
- **`src/server/gateways/jira/http-adapter.test.ts`**:
  - Add one decode-failure test per gateway method: canned response with the wrong shape (e.g. `{ wrong: 'shape' }` for `searchIssues`); assert `Effect.flip` yields `_tag: 'TransportError'`.
  - Existing 401/404/4xx-with-body tests stand (they exercise the status-code paths, which Schema decoding doesn't touch).
  - Existing happy-path tests (`searchIssues` decodes the response body) stand — they now exercise Schema decoding implicitly.
- **`gateways/jira/index.ts`** — re-exports continue to work since `RawX` types are still exported from `types.ts`, just derived now.
- **No changes** to application services or tests — they already work against `RawX` types and the hand-built fakes return already-typed values.

## Acceptance criteria

- [ ] Every `RawX` type and the relevant intermediate shapes in `gateways/jira/types.ts` are derived from `Schema.Struct` declarations. Hand-written interface declarations are gone for everything that crosses the HTTP boundary.
- [ ] `decodeJsonBody<T>` and the `as Effect.Effect<T, JiraGatewayError>` cast are removed from `gateways/jira/http-adapter.ts`.
- [ ] Each gateway method uses `decodeJsonAs(<schema>)` (or inline equivalent) for response decoding.
- [ ] `gateways/jira/http-adapter.test.ts` has a decode-failure test per gateway method asserting `TransportError`.
- [ ] Existing application-service tests (`load-board`, `load-issue`, `load-my-epics`, `load-myself`, `quick-create`, `load-transitions`, `perform-transition`, `load-review-cards`) all green unchanged.
- [ ] Status names with mixed casing flow through unmodified (no literal-union tightening).
- [ ] `priority.name === "Undefined"` continues to be tolerated.
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm test && pnpm test:e2e` all green.

## Blocked by

- 80 — `TransportError` must exist before decode failures can route to it.

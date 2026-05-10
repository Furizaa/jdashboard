# server/contexts/board

The server side of the Board context — the use-case that fetches the user's currently-tracked tickets and shapes them into the JSON the client's Board view-model expects.

This is the canonical example for server-context migration. Subsequent contexts (`detail`, `capture`, `review`) follow this same shape.

## Public server-function surface

`src/server/server-functions/board.ts`:

| Server function | Method | Returns                                                                           |
| --------------- | ------ | --------------------------------------------------------------------------------- |
| `searchIssues`  | GET    | `{ ok: true, baseUrl, issues } \| { ok: false, error: { _tag: 'Unauthorized' } }` |
| `getMrStatuses` | GET    | `{ ok: true, byKey } \| { ok: false, error: { _tag: 'Unauthorized' } }`           |

The wire shape is unchanged from before this refactor (ADR 0004) — the client's `kernel/jira.ts` re-exports the legacy `SearchIssuesResult` alias and keeps consuming the same JSON.

## Application-service surface

`src/server/contexts/board/application/`:

```ts
loadBoard: Effect.Effect<LoadBoardOk, JiraUnauthorized, JiraGateway | BoardConfig>
loadMrStatuses: Effect.Effect<LoadMrStatusesOk, GitlabUnauthorized, GitlabGateway | BoardConfig>
```

Each application service is a single Effect — not a factory. The dependency channel (`R`) carries the relevant gateway Tag plus `BoardConfig`; the runtime supplies them via the `appLayer`. There is no `BoardApplicationService` factory, no `createBoardApplicationService(deps)` — Effect's Layer-based DI is the seam.

**`loadBoard`** does:

1. Reads `BoardConfig` (project key, label filter, hide labels, done-window days, base URL).
2. Builds the JQL string (4 clauses joined by `AND`, ordered by rank).
3. Calls `JiraGateway.searchIssues(jql, BOARD_FIELDS)`.
4. Filters labels case-insensitively against `hideLabels`.
5. Lifts a `parent` whose `issuetype.name` is `Epic` into the issue's `epic` field; otherwise `epic = null`.
6. Returns `{ baseUrl, issues }`.

`JiraUnauthorized` propagates as a tagged failure (and serialises to wire `_tag: 'Unauthorized'`). `JiraRejected` and `JiraNotFound` from the gateway are demoted to defects via `Effect.catchTags` (the existing service throws on these too — preserved as defects so `toWire`'s `catchAllDefect` produces `InternalError`).

**`loadMrStatuses`** does:

1. Reads `BoardConfig` for `projectKey` (Jira) and `doneWindowDays` (the `updatedAfter` cutoff for GitLab).
2. Calls `GitlabGateway.getCurrentUser()` and `listMrs({ states: ['opened', 'merged'], authorUsername, updatedAfter })`.
3. Builds the `(jiraKey → MR)` map from MR titles via `buildMrKeyMap` (gateway helper).
4. Fans out per-MR (`concurrency: 5`) to fetch detail / discussions / approvals / reviewers via `fetchMrBundle`, then summarises each via `summarizeMr`.
5. Returns `{ byKey }`.

`GitlabUnauthorized` propagates as a tagged failure. `GitlabNotFound` / `GitlabRejected` from the user/list calls are demoted to defects (a 5xx during board polling surfaces as `InternalError`); per-MR fan-out failures drop the affected MR but keep the rest.

## Gateway dependencies

- `JiraGateway` (port: `~/server/gateways/jira/port`) — `loadBoard` uses `searchIssues` only.
- `GitlabGateway` (port: `~/server/gateways/gitlab/port`) — `loadMrStatuses` uses `getCurrentUser`, `listMrs`, `getMr`, `getMrDiscussions`, `getMrApprovals`, `getMrReviewers` (the last four via the shared `fetchMrBundle` helper in `gateways/gitlab/mr-fanout.ts`).

## Error unions

- `LoadBoardError = Schema.Union(JiraUnauthorized)`
- `LoadMrStatusesError = Schema.Union(GitlabUnauthorized)`

Each handler hands its error union to `toWire`, which encodes the tagged failure on the wire. The wire `_tag` stays `'Unauthorized'` for both Jira and GitLab; class names are gateway-prefixed only for in-code disambiguation. The client discriminates by the handler that produced the response, not by the tag string.

## Config

`BoardConfig` (Tag) + `BoardConfigLive` (Layer) — derived from `ServerEnv`. Lives in `src/server/contexts/board/config.ts`. The Live Layer is provided per-handler via `Effect.provide(BoardConfigLive)` so the runtime's pre-built dependency graph stays minimal.

## Tests

`load-board.test.ts` and `load-mr-statuses.test.ts` use `@effect/vitest`'s `it.effect`. Gateways and config are faked via `Layer.succeed(JiraGateway, fake)` / `Layer.succeed(GitlabGateway, fake)` + `Layer.succeed(BoardConfig, fakeConfig)`. The hand-rolled fakes live in `__fixtures__/fake-jira-gateway.ts` and `__fixtures__/fake-gitlab-gateway.ts` (only the methods used need behaviour; the others throw on call).

## Domain

Empty for this slice. Board has no Board-specific server-side pure functions yet (the JQL builder, issue shaper, and MR summariser are either local helpers or live with the gateway that produces them, e.g. `gateways/gitlab/mr-status.ts` and `gateways/gitlab/mr-key-map.ts`). If a Board-specific helper grows, it moves to `domain/`.

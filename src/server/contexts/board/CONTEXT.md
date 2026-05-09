# server/contexts/board

The server side of the Board context — the use-case that fetches the user's currently-tracked tickets and shapes them into the JSON the client's Board view-model expects.

This is the canonical example for server-context migration. Subsequent contexts (`detail`, `capture`, `review`) follow this same shape.

## Public server-function surface

`src/server/server-functions/board.ts`:

| Server function | Method | Returns                                                                           |
| --------------- | ------ | --------------------------------------------------------------------------------- |
| `searchIssues`  | GET    | `{ ok: true, baseUrl, issues } \| { ok: false, error: { _tag: 'Unauthorized' } }` |

The wire shape is unchanged from before this refactor (ADR 0004) — the client's `kernel/jira.ts` re-exports the legacy `SearchIssuesResult` alias and keeps consuming the same JSON.

## Application-service surface

`src/server/contexts/board/application/load-board.ts`:

```ts
loadBoard: Effect.Effect<LoadBoardOk, Unauthorized, JiraGateway | BoardConfig>
```

`loadBoard` is a single Effect — not a factory. The dependency channel (`R`) carries the `JiraGateway` and `BoardConfig` Tags; the runtime supplies them via the `appLayer`. There is no `BoardApplicationService` factory, no `createBoardApplicationService(deps)` — Effect's Layer-based DI is the seam.

What it does:

1. Reads `BoardConfig` (project key, label filter, hide labels, done-window days, base URL).
2. Builds the JQL string (4 clauses joined by `AND`, ordered by rank).
3. Calls `JiraGateway.searchIssues(jql, BOARD_FIELDS)`.
4. Filters labels case-insensitively against `hideLabels`.
5. Lifts a `parent` whose `issuetype.name` is `Epic` into the issue's `epic` field; otherwise `epic = null`.
6. Returns `{ baseUrl, issues }`.

`Unauthorized` propagates as a tagged failure. `Rejected` and `NotFound` from the gateway are demoted to defects via `Effect.catchTags` (the existing service throws on these too — preserved as defects so `toWire`'s `catchAllDefect` produces `InternalError`).

## Gateway dependencies

- `JiraGateway` (port: `~/server/gateways/jira/port`) — uses `searchIssues` only.

## Error union

`LoadBoardError = Schema.Union(Unauthorized)`. The handler hands this schema to `toWire`, which encodes it on the failure path.

## Config

`BoardConfig` (Tag) + `BoardConfigLive` (Layer) — derived from `ServerEnv`. Lives in `src/server/contexts/board/config.ts`. The Live Layer is provided per-handler via `Effect.provide(BoardConfigLive)` so the runtime's pre-built dependency graph stays minimal.

## Tests

`load-board.test.ts` uses `@effect/vitest`'s `it.effect`. Gateway and config are faked via `Layer.succeed(JiraGateway, fake)` + `Layer.succeed(BoardConfig, fakeConfig)`. The hand-rolled fake gateway lives in `__fixtures__/fake-jira-gateway.ts` (only the methods Board uses need behaviour; the others throw on call).

## Domain

Empty for Phase 1. Board has no Board-specific server-side pure functions yet (the JQL builder and the issue shaper are local helpers; if either grows, it moves to `domain/`).

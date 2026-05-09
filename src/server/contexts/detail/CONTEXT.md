# server/contexts/detail

The server side of the Detail context — the side-panel ticket view's three use-cases:

1. `loadIssue` — fetch a single issue with its sub-issues, links, parent, comments, and ADF description.
2. `loadTransitions` — list the transitions Jira will accept on a given key from its current status.
3. `performTransition` — apply a transition by id.

Reuses the `JiraGateway` port + adapter introduced by Board (slice 63). No gateway changes here.

## Public server-function surface

`src/server/server-functions/detail.ts`:

| Server function   | Method | Returns                                                                                        |
| ----------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `getIssue`        | GET    | `{ ok: true, baseUrl, issue } \| { ok: false, error: { _tag: 'Unauthorized' \| 'NotFound' } }` |
| `getTransitions`  | GET    | `{ ok: true, transitions } \| { ok: false, error: { _tag: 'Unauthorized' \| 'NotFound' } }`    |
| `transitionIssue` | POST   | `{ ok: true } \| { ok: false, error: { _tag: 'Unauthorized' \| 'Rejected', message? } }`       |

The `InternalError` tag is added by `toWire` for any unhandled defect — clients see a tagged shape uniformly.

## Application-service surface

`src/server/contexts/detail/application/`:

```ts
loadIssue(key): Effect.Effect<LoadIssueOk, Unauthorized | NotFound, JiraGateway | DetailConfig>
loadTransitions(key): Effect.Effect<LoadTransitionsOk, Unauthorized | NotFound, JiraGateway>
performTransition(key, transitionId): Effect.Effect<PerformTransitionOk, Unauthorized | Rejected, JiraGateway>
```

Each application service is a function returning an `Effect`, not a factory. The dependency channel (`R`) carries `JiraGateway` (and `DetailConfig` for `loadIssue`); the runtime supplies them via the `appLayer`.

What they do:

- **`loadIssue`** runs `JiraGateway.getIssue` and `JiraGateway.searchIssues(parent = "...")` in parallel, shapes the resulting `RawDetailedIssue` into a `DetailIssue` (priority `"Undefined"` sentinel → `null`, parent → `LinkedIssueRef`, sub-issues → `LinkedIssueRef[]`, links → directional `IssueLink[]`, comments with avatar fallback). `Rejected` from either gateway call becomes a defect (matches old behaviour: it was a thrown `Error`).
- **`loadTransitions`** calls `JiraGateway.getTransitions` and forwards the array. `Rejected` becomes a defect.
- **`performTransition`** calls `JiraGateway.transitionIssue` and translates `NotFound` → `Rejected({ message: 'Issue not found' })`. This preserves the legacy issue-service quirk where a 404 from Jira's transition endpoint surfaced to the user as a rejection rather than a tagged "not found".

## Gateway dependencies

- `JiraGateway` (port: `~/server/gateways/jira/port`) — uses `getIssue`, `searchIssues`, `getTransitions`, `transitionIssue`.

## Error unions

- `LoadIssueError = Schema.Union(Unauthorized, NotFound)`
- `LoadTransitionsError = Schema.Union(Unauthorized, NotFound)`
- `PerformTransitionError = Schema.Union(Unauthorized, Rejected)`

Each handler hands its error union to `toWire`, which encodes the tagged failure on the wire and adds `InternalError` for any uncaught defect.

## Config

`DetailConfig` (Tag) + `DetailConfigLive` (Layer) — derived from `ServerEnv`. Holds only `baseUrl` (used by `loadIssue` to surface the Jira base URL on the wire). Lives in `src/server/contexts/detail/config.ts`. Provided per-handler via `Effect.provide(DetailConfigLive)` so the runtime's pre-built dependency graph stays minimal.

## Tests

Each application module has a sibling `*.test.ts` using `@effect/vitest`'s `it.effect`. Gateway and config are faked via `Layer.succeed(JiraGateway, fake)` + `Layer.succeed(DetailConfig, config)`. The hand-rolled fake gateway lives in `__fixtures__/fake-jira-gateway.ts` (per-context, even when its shape mirrors Board's — the rule is per-context fakes).

## Domain

Empty for this slice. The `toLinkedRef` and ADF mapping helpers live inside `load-issue.ts` as local functions; if Detail grows another use-case that needs them they'd move to `domain/` or to `gateways/jira/`.

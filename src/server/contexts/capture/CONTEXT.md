# server/contexts/capture

The server side of the Capture context — the Quick Create modal's three use-cases:

1. `loadMyself` — fetch the current Jira user (also used by the client's `AuthGate` route).
2. `loadMyEpics` — list the user's currently-in-progress epics for the parent picker.
3. `quickCreate` — create a Jira issue from the validated form input.

Reuses the `JiraGateway` port + adapter introduced by Board (slice 63). No gateway changes here.

## The Zod-at-boundary lesson

The Quick Create form input crosses the client/server boundary, so its schema is **Zod**:

- The client's TanStack Form consumes `quickCreateSchema` for field-level validation.
- The server-function `inputValidator` calls `quickCreateSchema.parse(data)` to validate at the wire boundary.

Both sides import from `~/server/contexts/capture/application/quick-create-schema` (via the `~/kernel` re-export on the client). One validator, one source of truth — **per side of the boundary, not per repo**.

Server-internal validation (HTTP response shape decoding, internal codecs) uses `effect/Schema` instead — see `gateways/jira/http-adapter.ts` for the pattern. The split is structural: Zod knows about form-input contracts the client cares about; Schema knows about server-internal types and tagged errors. They do not overlap.

`application/quick-create.ts` does NOT import `effect/Schema` for parsing the input — by the time the use-case runs, the input has already been Zod-parsed at the server-function boundary and arrives typed as `QuickCreateInput`.

## Public server-function surface

`src/server/server-functions/capture.ts`:

| Server function | Method | Returns                                                                                                                    |
| --------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `getMyself`     | GET    | `{ ok: true, user } \| { ok: false, error: { _tag: 'Unauthorized' } }`                                                     |
| `getMyEpics`    | GET    | `{ ok: true, epics } \| { ok: false, error: { _tag: 'Unauthorized' } }`                                                    |
| `createIssue`   | POST   | `{ ok: true, key, baseUrl } \| { ok: false, error: { _tag: 'Unauthorized' \| 'Rejected' \| 'TransportError', message? } }` |

The `InternalError` tag is added by `toWire` for any unhandled defect — clients see a tagged shape uniformly, but the handler converts it into a thrown exception so react-query's `isError` flag flips.

`createIssue.inputValidator` calls `quickCreateSchema.safeParse(data)`. The handler then runs `appRuntime.runPromise(toWire(quickCreate(data).pipe(Effect.provide(CaptureConfigLive)), QuickCreateError))`.

## Application-service surface

`src/server/contexts/capture/application/`:

```ts
loadMyself: Effect.Effect<LoadMyselfOk, JiraUnauthorized, JiraGateway>
loadMyEpics: Effect.Effect<LoadMyEpicsOk, JiraUnauthorized, JiraGateway | CaptureConfig>
quickCreate(input): Effect.Effect<QuickCreateOk, JiraUnauthorized | JiraRejected | JiraTransportError, JiraGateway | CaptureConfig>
```

What they do:

- **`loadMyself`** calls `JiraGateway.getMyself()` and surfaces the user. `NotFound`, `Rejected`, and `TransportError` from the gateway become defects (the Jira `/myself` endpoint never legitimately returns the first two; a transport blip during user lookup is rare enough that surfacing it as `InternalError` and letting react-query show "Sync failed" is the right policy for this read path).
- **`loadMyEpics`** builds an epic JQL from `CaptureConfig.epic.statuses` + `CaptureConfig.projectKey`, calls `JiraGateway.searchIssues`, and shapes the response into `EpicRef[]`. `NotFound`, `Rejected`, and `TransportError` become defects (server-built JQL won't legitimately produce a 4xx; transport failures demote to `InternalError` consistent with the other read paths).
- **`quickCreate`** runs `loadMyself` first (for `accountId`), assembles the `CreateIssueBody` via `domain/build-create-payload.ts`, then calls `JiraGateway.createIssue`. Only `NotFound` is demoted (the `/myself` and create endpoints don't legitimately 404); `Unauthorized`, `Rejected`, and `TransportError` propagate as tagged failures because a transport blip during a write should reach the user as a tagged failure, not be silently relabeled.

## Gateway dependencies

- `JiraGateway` (port: `~/server/gateways/jira/port`) — uses `getMyself`, `searchIssues`, `createIssue`.

## Error unions

- `LoadMyselfError = Schema.Union(JiraUnauthorized)`
- `LoadMyEpicsError = Schema.Union(JiraUnauthorized)`
- `QuickCreateError = Schema.Union(JiraUnauthorized, JiraRejected, JiraTransportError)`

Each handler hands its error union to `toWire`, which encodes the tagged failure on the wire and adds `InternalError` for any uncaught defect.

## Config

`CaptureConfig` (Tag) + `CaptureConfigLive` (Layer) — derived from `ServerEnv`. Holds `projectKey`, `quickCreate` (summary prefix, default labels, default priority), `epic` (statuses to filter by), and `baseUrl`. Lives in `src/server/contexts/capture/config.ts` together with the legacy `defaultQuickCreateConfig` and `defaultEpicConfig` constants. Provided per-handler via `Effect.provide(CaptureConfigLive)` so the runtime's pre-built dependency graph stays minimal.

## Tests

Each application module has a sibling `*.test.ts` using `@effect/vitest`'s `it.effect`. Gateway and config are faked via `Layer.succeed(JiraGateway, fake)` + `Layer.succeed(CaptureConfig, config)`. The hand-rolled fake gateway lives in `__fixtures__/fake-jira-gateway.ts` (per-context, even though its shape mirrors Board's and Detail's — the rule is per-context fakes).

`quick-create.test.ts` covers both transitive `Unauthorized` paths (from `loadMyself` and from `createIssue`), the `Rejected` path, and the `TransportError` path.

## Domain

`domain/plain-text-to-adf.ts` and `domain/build-create-payload.ts` hold the pure helpers extracted from the legacy `issue-service.ts`. Each has a sibling `*.test.ts`.

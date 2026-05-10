# server/contexts/detail

The server side of the Detail context — the side-panel ticket view's three use-cases:

1. `loadIssue` — fetch a single issue with its sub-issues, links, parent, comments, and ADF description.
2. `loadTransitions` — list the transitions Jira will accept on a given key from its current status.
3. `performTransition` — apply a transition by id.

Reuses the `JiraGateway` port + adapter introduced by Board (slice 63). No gateway changes here.

## Public server-function surface

`src/server/server-functions/detail.ts`:

| Server function   | Method | Returns                                                                                                      |
| ----------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| `getIssue`        | GET    | `{ ok: true, baseUrl, issue } \| { ok: false, error: { _tag: 'Unauthorized' \| 'NotFound' } }`               |
| `getTransitions`  | GET    | `{ ok: true, transitions } \| { ok: false, error: { _tag: 'Unauthorized' \| 'NotFound' } }`                  |
| `transitionIssue` | POST   | `{ ok: true } \| { ok: false, error: { _tag: 'Unauthorized' \| 'Rejected' \| 'TransportError', message? } }` |

The `InternalError` tag is added by `toWire` for any unhandled defect — clients see a tagged shape uniformly.

## Application-service surface

`src/server/contexts/detail/application/`:

```ts
loadIssue(key): Effect.Effect<LoadIssueOk, JiraUnauthorized | JiraNotFound, JiraGateway | DetailConfig>
loadTransitions(key): Effect.Effect<LoadTransitionsOk, JiraUnauthorized | JiraNotFound, JiraGateway>
performTransition(key, transitionId): Effect.Effect<PerformTransitionOk, JiraUnauthorized | JiraRejected | JiraTransportError, JiraGateway>
```

Each application service is a function returning an `Effect`, not a factory. The dependency channel (`R`) carries `JiraGateway` (and `DetailConfig` for `loadIssue`); the runtime supplies them via the `appLayer`.

What they do:

- **`loadIssue`** runs `JiraGateway.getIssue` (with `attachment` requested as part of the issue fields) and `JiraGateway.searchIssues(parent = "...")` in parallel, shapes the resulting `RawDetailedIssue` into a `DetailIssue` (priority `"Undefined"` sentinel → `null`, parent → `LinkedIssueRef`, sub-issues → `LinkedIssueRef[]`, links → directional `IssueLink[]`, comments with avatar fallback). `JiraRejected` and `JiraTransportError` from either gateway call become defects (the JQL is server-built and the path is read-only, so a transport blip should surface to the user as `InternalError` and let react-query show "Sync failed" rather than a tagged failure); `JiraNotFound` from `searchIssues` is also demoted (only `getIssue`'s `JiraNotFound` propagates as a tagged failure). After shaping, `loadIssue` builds a filename-keyed attachment map (`{ filename → { attachmentId, mimeType } }`) directly from `detailed.fields.attachment` and applies the pure walker `enrichAdfWithMedia(adf, attachmentByFilename)` from `domain/` to inject `attrs.url = '/api/jira-media/<integerAttachmentId>'` and `attrs.mimeType` into each media node whose `attrs.alt` filename matches an attachment. No dedicated media-metadata Jira call is made — the metadata rides along on the issue payload. Filename misses degrade silently to the existing placeholder. See ADR-0006.
- **`loadTransitions`** calls `JiraGateway.getTransitions` and forwards the array. `JiraRejected` and `JiraTransportError` become defects (read-only path, same rationale as `loadIssue`).
- **`performTransition`** calls `JiraGateway.transitionIssue` and translates `JiraNotFound` → `new JiraRejected({ message: 'Issue not found' })`. This preserves the legacy issue-service quirk where a 404 from Jira's transition endpoint surfaced to the user as a rejection rather than a tagged "not found". `JiraTransportError` propagates as a tagged failure (writes surface transport-class failures to the user; only the read paths demote them).

## Gateway dependencies

- `JiraGateway` (port: `~/server/gateways/jira/port`) — uses `getIssue`, `searchIssues`, `getTransitions`, `transitionIssue`. `loadIssue`'s ADF enrichment pass reads attachment metadata co-fetched via `getIssue` (see ADR-0006), so no separate gateway method is needed for it. The sibling `streamMedia` method is consumed by the `src/routes/api/jira-media.$id.ts` API route, not by this context.

## Error unions

- `LoadIssueError = Schema.Union(JiraUnauthorized, JiraNotFound)`
- `LoadTransitionsError = Schema.Union(JiraUnauthorized, JiraNotFound)`
- `PerformTransitionError = Schema.Union(JiraUnauthorized, JiraRejected, JiraTransportError)`

Each handler hands its error union to `toWire`, which encodes the tagged failure on the wire and adds `InternalError` for any uncaught defect.

## Config

`DetailConfig` (Tag) + `DetailConfigLive` (Layer) — derived from `ServerEnv`. Holds only `baseUrl` (used by `loadIssue` to surface the Jira base URL on the wire). Lives in `src/server/contexts/detail/config.ts`. Provided per-handler via `Effect.provide(DetailConfigLive)` so the runtime's pre-built dependency graph stays minimal.

## Tests

Each application module has a sibling `*.test.ts` using `@effect/vitest`'s `it.effect`. Gateway and config are faked via `Layer.succeed(JiraGateway, fake)` + `Layer.succeed(DetailConfig, config)`. The hand-rolled fake gateway lives in `__fixtures__/fake-jira-gateway.ts` (per-context, even when its shape mirrors Board's — the rule is per-context fakes).

## Domain

`enrichAdfWithMedia(adf, attachmentByFilename) → AdfNode` — pure walker that injects `attrs.url` and `attrs.mimeType` into every `media` node whose `attrs.alt` filename is keyed in the map; nodes whose filename is missing (or whose `alt` is absent / non-string) are returned unchanged so the client falls back to the placeholder. Filename collisions inside one issue are first-wins. Table-driven unit tests cover top-level media, media nested in paragraphs, media in mediaGroups, comment bodies, and partial-success maps. Lives in `domain/enrich-adf-with-media.ts`. The `toLinkedRef` helpers continue to live inside `load-issue.ts` as local functions.

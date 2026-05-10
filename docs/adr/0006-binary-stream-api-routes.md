# Binary-stream HTTP API routes outside the `toWire` JSON-RPC boundary

clashboard introduces a new server entry-point shape — **`src/routes/api/<name>.ts`**, a TanStack Start file-route layer — for HTTP endpoints whose response is a **binary stream**, not a `WireResult<A>` JSON envelope. The first endpoint, `src/routes/api/jira-media.$id.ts`, proxies Jira media-services binaries (images, videos) through the server so the browser fetches them via stable, server-mediated URLs instead of short-lived Jira media tokens. ADR-0005's `toWire(program, errorSchema)` JSON-RPC boundary applies to **`server/server-functions/*`**; it does not apply here. Errors map to HTTP status codes (`404`, `502`); `Schema.TaggedError` does not cross this layer.

The proximate driver is product: rendering inline images and videos in the Detail panel's ADF requires resolved URLs, and Jira's tokenised media URLs expire in ~10–15 minutes — which is shorter than the lifetime of a Detail panel a user keeps open. The ultimate driver is **honesty about contract shape**: bypassing `toWire` from inside `server-functions/` to support a binary response would weaken ADR-0005's invariant that `toWire` is the only `Effect → JSON` boundary, in a way invisible at the call site. The team-template lesson is that the JSON-RPC contract and the HTTP contract are different shapes; a codebase that mixes them inside one namespace teaches that the distinction does not matter, when it does.

## Considered Options

- **(b1) `createServerFn` returning `Response` directly.** Stay inside `server-functions/` but short-circuit `toWire` for media — handler returns a `Response` (or `ReadableStream`) instead of `WireResult<A>`. _Rejected:_ silently exempts one handler from ADR-0005's wire-boundary invariant. Future readers reasonably assume every `server-functions/*` handler goes through `toWire`; the exemption is invisible at the call site. The ADR-0005 dependency-cruiser rule cannot codify "all handlers except this one." Two contracts inside one namespace teaches that the contract distinction is cosmetic.

- **(c) Hybrid: server pre-resolves direct Jira media URLs and embeds them in `attrs`.** Browser fetches Jira's CDN directly with the time-limited token. _Rejected:_ The expiration problem is the load-bearing reason for choosing a proxy at all. Detail panels are read-mostly and routinely held open past the token lifetime; clicking a media after token expiry would 403 silently. Also depends on Jira's media-services CORS policy across enterprise tenants, which is not a guarantee we want to build on. Streaming/range support for video is the responsibility of Jira's CDN headers, which we do not control.

- **(b2) New `src/routes/api/` layer with a TanStack Start file-route.** _Selected._ HTTP-shaped endpoints live outside `server-functions/`. Handler reads inputs from request parameters, calls `appRuntime.runPromise` against an `Effect<{ stream, mimeType, contentLength? }, ...>`, and writes a `Response`. Errors map to HTTP status codes. New dependency-cruiser rules codify what the layer can and cannot import. The layer is **deliberately small and rule-bound** — its existence advertises that some endpoints have HTTP shape and not RPC shape, and the route discovery file-system reflects that.

## When to use this layer (and when not to)

Use `src/routes/api/<name>.ts` when **any one** of these is true:

- The response is a **binary stream** or otherwise not naturally a `{ ok: true | false, ...payload }` JSON shape (file downloads, image/video proxying, CSV exports, server-sent events).
- The endpoint must honour HTTP semantics that `toWire` cannot express — `Range` requests, `Content-Type` negotiation, `Cache-Control` headers driven by upstream metadata, redirects.
- The endpoint is consumed by the browser as a URL string (`<img src>`, `<a href>`, `<video src>`), not by typed RPC client code.

Do **not** use it for:

- Anything where the response naturally serialises to JSON that the client unwraps via neverthrow — that is `server-functions/`.
- Anything where the typed-error contract (tagged-union failure shape) is load-bearing for the consumer — also `server-functions/`.

The rule of thumb: if the consumer is `<img src="...">`, this layer; if the consumer is `await getIssueServerFn(key)`, the JSON-RPC layer.

## Folder layout

```
src/routes/
├── __root.tsx
├── index.tsx
└── api/                           ← NEW LAYER
    └── jira-media.$id.ts          ← first instance: GET /api/jira-media/:id
```

Why under `src/routes/` and not `src/server/api/`: TanStack Start performs file-based route discovery rooted at `src/routes/`. Co-locating with the rest of the route tree is what the framework expects; introducing a parallel `src/server/api/` would require route-registration plumbing for no architectural gain. The dependency-cruiser rules below stop the layer from leaking into the user-facing route tree.

## Dependency law (additive to ADR-0005)

Allowed edges from `src/routes/api/`:

- → `src/server/runtime/*` (calls `appRuntime.runPromise`)
- → `src/server/gateways/<system>/{port, types, errors}` (composes gateway operations as the program for this request)
- → `effect`, `@effect/platform`

Forbidden (codified as `dependency-cruiser` rules):

- `src/routes/api/*` → `src/server/server-functions/*` — API routes do not import RPC handlers; if the same Effect is needed in both shapes, it lives in `server/contexts/<name>/application/` and both call sites import from there.
- `src/routes/api/*` → `src/server/wire/*` — `toWire` is for `server-functions/`; importing it here is an architecture smell flagged at lint time.
- `src/routes/<anything-not-api>/*` → `src/routes/api/*` — the user-facing route tree never imports the API tree. (The browser hits API URLs as strings.)
- `src/contexts/*`, `src/widgets/*`, `src/coordinator/*`, `src/kernel/*` → `src/routes/api/*` — same reason.

`src/routes/api/*` may import from `src/server/contexts/<name>/application/` when the endpoint corresponds to a use-case cluster that already exists on the contexts axis. The first endpoint (`jira-media`) does **not** — it is gateway-direct (`JiraGateway.streamMedia`) because there is no Detail-context use-case "stream media bytes" beyond the gateway operation itself. Future endpoints may go through application services if they orchestrate multiple gateways.

## Error mapping

`src/routes/api/jira-media.$id.ts` runs an `Effect<MediaStream, MediaResolutionError | MediaNotFound, JiraGateway>` and maps the result:

| Source                                            | HTTP status | Body                                                                 |
| ------------------------------------------------- | ----------- | -------------------------------------------------------------------- |
| `MediaStream` (success)                           | `200`       | binary stream, `Content-Type: <mimeType>`, `Content-Length` if known |
| `MediaNotFound` (Jira `404`)                      | `404`       | `text/plain` `'Media not found'`                                     |
| `MediaResolutionError` from Jira `401`/`403`      | `502`       | `text/plain` `'Upstream auth error'`                                 |
| `MediaResolutionError` from Jira `5xx` or network | `502`       | `text/plain` `'Upstream error'`                                      |
| Unhandled defect (`Effect.catchAllDefect`)        | `500`       | `text/plain` `'Internal error'`; defect logged                       |

Plain-text bodies, not JSON. The browser's `<img onerror>` / `<video onerror>` does not inspect the body; the text is for humans browsing the URL directly. Mapping `401/403` from Jira to `502` (and not `401`) is deliberate — the user's clashboard auth is fine; the proxy itself failed upstream.

The new tagged errors live in `src/server/gateways/jira/errors.ts`:

```ts
class MediaResolutionError extends Schema.TaggedError<MediaResolutionError>()(
  'MediaResolutionError',
  { message: Schema.String, status: Schema.Number },
) {}
class MediaNotFound extends Schema.TaggedError<MediaNotFound>()('MediaNotFound', {}) {}
```

These also flow into `loadIssue`'s enrichment path; the application service catches them per-id and treats unresolvable media as "skip enrichment, leave placeholder" — `loadIssue` does not fail because some media couldn't be resolved.

## ADF media enrichment (the consumer of `getMediaMetadata`)

The mirror-image of the proxy route is server-side ADF enrichment at `loadIssue` time. The application service `loadIssue`:

1. Walks the loaded `DetailIssue.description` and every `comments[].body`, collecting all `media` node `id`s.
2. Calls `JiraGateway.getMediaMetadata(ids)`, which fans out one `GET /rest/api/3/attachment/metadata/<id>` per id with `Effect.all({ concurrency: 5 })`-bounded concurrency. Per-id `404`s are dropped silently from the result; other failures (`401`/`403`/`5xx`/network) fail the whole call with `MediaResolutionError`.
3. Applies a pure walker — `src/server/contexts/detail/domain/enrich-adf-with-media.ts` — that injects `url: '/api/jira-media/<id>'` and `mimeType: '<resolved>'` into each `media` node's `attrs` before returning.

Per-id resolution failures degrade to "node renders as the existing 'Media hosted in Jira' placeholder" — partial success is the contract. The walker is `(adf, mediaUrlMap) => AdfNode`, pure, table-driven, unit-tested.

The proxy route's binary fetch is a single `GET /rest/api/3/attachment/content/<id>?redirect=false`. The `redirect=false` query parameter asks Jira to stream bytes directly rather than `303 See Other`-redirecting to a media-services CDN; this keeps the proxy a one-hop pipe.

The two new `JiraGateway` methods:

```ts
// src/server/gateways/jira/port.ts
readonly getMediaMetadata: (
  ids: readonly string[],
) => Effect.Effect<readonly MediaMetadata[], MediaResolutionError>

readonly streamMedia: (
  id: string,
) => Effect.Effect<MediaStream, MediaResolutionError | MediaNotFound>

type MediaMetadata = {
  readonly id: string
  readonly mimeType: string
  readonly width?: number
  readonly height?: number
}
type MediaStream = {
  readonly stream: ReadableStream<Uint8Array>
  readonly mimeType: string
  readonly contentLength?: number
}
```

The application service and the API route both consume these methods atomically.

## Policy menu (caching)

Per ADR-0005's menu-with-upgrade-path framing:

| Policy         | Phase 1                                        | Upgrade path                                                                                                                                                                                                                                             |
| -------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metadata cache | **None** — every gateway call hits Jira fresh. | `Cache.make` Layer keyed on attachment id with TTL ≈ minutes. Adopted when Jira's per-tenant rate limit gets hit in practice — earlier than under a bulk-token flow, since the metadata fan-out is now N calls per `loadIssue` instead of one bulk call. |

Math: `loadIssue` makes N concurrency-bounded `attachment/metadata/<id>` calls, where N is the number of `media` nodes across the description and all comments (no separate token call). The proxy route makes 1 `attachment/content/<id>?redirect=false` call per media open. A panel with M media nodes opened, one media clicked, panel closed: M + 1 Jira calls. The fan-out lifts the per-`loadIssue` ceiling compared to a bulk endpoint, which is the relevant change for the rate-limit upgrade path; in absolute terms this still sits comfortably under any reasonable rate limit for typical issues. Caching is a real upgrade lever, not a Phase 1 requirement.

## Why this is a separate ADR (and not an addendum to ADR-0005)

ADR-0005 covers the JSON-RPC server architecture (`server-functions/`, `toWire`, `Schema.TaggedError`, the wire boundary). This ADR introduces a parallel layer with a deliberately different contract shape. The two interact (the Jira gateway port is shared; the runtime is shared) but the rules differ:

- `server-functions/` errors travel the `E` channel and become tagged JSON. `routes/api/` errors travel the `E` channel and become HTTP status codes.
- `server-functions/` outputs are JSON values composed via `toWire`. `routes/api/` outputs are HTTP `Response`s composed by hand from `MediaStream` (or future similar shapes).
- `server-functions/` is consumed by typed RPC client code. `routes/api/` is consumed by the browser as URL strings.

Folding this into ADR-0005 would muddy the lesson ADR-0005 teaches: that the JSON-RPC contract is uniform and enforced. A separate ADR makes the contract distinction visible.

## Tests

- **Gateway methods** (`getMediaMetadata`, `streamMedia`) — unit-tested with `it.effect` against a faked `HttpClient.HttpClient` returning canned media-services responses; per-status error mapping covered table-driven.
- **`enrichAdfWithMedia` walker** — pure unit tests, table-driven over ADF inputs and `MediaMetadata` maps. Covers: media-with-resolved-id, media-with-unresolvable-id (placeholder fallback), nested media inside paragraphs, media inside comments.
- **`loadIssue` application service** — `it.effect` with a faked `JiraGateway` Tag whose `getMediaMetadata` returns a known map. Asserts the returned `DetailIssue.description` and each comment body have `attrs.url` / `attrs.mimeType` populated.
- **API route handler** — small unit test: given a faked `JiraGateway` returning a `MediaStream`, the handler returns a `Response` with status `200`, the right `Content-Type`, and the stream as body. Status-mapping cases tested per error tag.
- **End-to-end** — one new spec `tests/e2e/ticket-detail/adf-media-lightbox.spec.ts` per ADR-0001 (MSW at HTTP boundary). Three cases: image opens modal, video opens modal and autoplays muted, error-state chip rendered when MSW returns `404`. The Jira media-services calls are added as new MSW handlers.

## Migration

Single PR slice (Slice 3a in the Detail-rendering PRD): adds `JiraGateway.getMediaMetadata` + `streamMedia`, the new tagged errors, the `enrichAdfWithMedia` domain walker, the API route, the dependency-cruiser rules. After this slice, real images render inline against real Jira data with no client-rendering changes (existing `Media.tsx` already renders `<img>` for url-bearing media). The lightbox slice (3b) and e2e coverage (3c) follow.

## References

- ADR-0005 — Effect-TS server architecture; `toWire` JSON-RPC boundary this layer deliberately sits beside.
- ADR-0001 — Mock at the network boundary for e2e; MSW handler additions for Jira media-services calls.
- ADR-0004 — neverthrow on the client / Effect on the server; the wire-shape contract this layer does not participate in.

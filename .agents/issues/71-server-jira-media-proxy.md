# 71 — Server-side Jira media proxy + ADF media enrichment (lands ADR-0006)

**Type:** AFK

## Parent

[ADF rendering extensions PRD](../prds/adf-rendering-extensions.md)

## What to build

The architectural slice. Resolves Jira media-services bytes through a new HTTP-shaped server entry-point layer so the Detail panel's ADF renderer has resolved URLs for every `media` node. After this slice merges, **real images render inline against real Jira data** with no client-rendering changes — the existing `Media.tsx` already renders `<img>` for url-bearing media.

This slice also lands a new layer (`src/routes/api/`) and the ADR (`docs/adr/0006-binary-stream-api-routes.md`, already drafted) that names its rules. The new layer is for HTTP-shaped server endpoints whose response is a binary stream, distinct from the JSON-RPC `toWire` envelope that `server-functions/` use.

Concretely:

- **`JiraGateway` extensions** in `src/server/gateways/jira/`:
  - `port.ts`: add two methods to `JiraGatewayShape`:
    - `readonly getMediaMetadata: (ids: readonly string[]) => Effect.Effect<readonly MediaMetadata[], MediaResolutionError>`
    - `readonly streamMedia: (id: string) => Effect.Effect<MediaStream, MediaResolutionError | MediaNotFound>`
  - `types.ts`: export `MediaMetadata = { id: string; mimeType: string; width?: number; height?: number }` and `MediaStream = { stream: ReadableStream<Uint8Array>; mimeType: string; contentLength?: number }`.
  - `errors.ts`: add two `Schema.TaggedError` classes:
    - `MediaResolutionError` with `{ message: Schema.String, status: Schema.Number }`.
    - `MediaNotFound` with `{}`.
    - Add to the gateway's error union.
  - `http-adapter.ts`: implement both methods.
    - `getMediaMetadata`: one POST to `/rest/api/3/media-tokens` with `{ ids }`; one GET against the returned media-services URL per id (or one bulk if the API supports it). Internal token handling — token never escapes the gateway.
    - `streamMedia`: POST to `/rest/api/3/media-tokens` for the single id; GET the binary; return the `Response.body` as a `ReadableStream<Uint8Array>` plus `mimeType` and `Content-Length` from the response headers.
    - Both methods map upstream HTTP statuses: `404 → MediaNotFound`; `401/403/5xx`/network → `MediaResolutionError` with the upstream status.
  - `http-adapter.test.ts`: extend existing tests with `it.effect` cases for both new methods. Status mapping tested per case.
- **New domain function** `src/server/contexts/detail/domain/enrich-adf-with-media.ts`:
  - Public `enrichAdfWithMedia(adf: AdfNode, mediaUrlMap: ReadonlyMap<string, MediaMetadata>): AdfNode`.
  - Pure recursive walker. For every `media` node whose `attrs.id` is in the map, returns a new node with `attrs.url = '/api/jira-media/<id>'` and `attrs.mimeType = <resolved>`. Other nodes pass through unchanged.
  - Walks children recursively across all node types (paragraphs, lists, blockquotes, panels, mediaSingle, mediaGroup).
  - Does not mutate input.
  - Handles null ADF and ADF with no media nodes by returning input.
- **Domain test** `enrich-adf-with-media.test.ts` — table-driven: top-level media gets enriched; media nested in paragraphs/lists/blockquotes/panels gets enriched; media inside mediaGroup gets enriched; media whose id is missing from the map passes through unchanged; non-media nodes are unmodified; input is not mutated; null/empty ADF is handled.
- **`loadIssue` orchestration extension** in `src/server/contexts/detail/application/load-issue.ts`:
  - After `shapeIssue` produces the `DetailIssue`, collect every `media` node `id` from `description` and from each `comments[].body` via a small `collectMediaIds(adf): string[]` helper (can colocate inside the file or extract to `domain/`).
  - If the collected list is non-empty, call `JiraGateway.getMediaMetadata(ids)`. Catch `MediaResolutionError` with `Effect.catchAll(() => Effect.succeed([]))` so an aggregate failure degrades to "no media enriched" rather than failing the issue load. Log at WARN.
  - Build a `Map<string, MediaMetadata>` from the resolved list (entries that came back from the gateway).
  - Apply `enrichAdfWithMedia` to `description` and to each comment body, returning the enriched issue.
  - The wire shape is unchanged — `attrs` already accepts string fields, so adding `url`/`mimeType` requires no schema change.
- **Application test** `load-issue.test.ts` — extend existing with cases:
  - Faked `JiraGateway` whose `getMediaMetadata` returns metadata for two of three ids (third is missing). Asserts the two known ids' nodes are enriched; the third stays un-enriched.
  - Faked `JiraGateway` whose `getMediaMetadata` fails entirely. Asserts the issue still loads and no media is enriched.
- **New API routes layer** at `src/routes/api/`:
  - Create `src/routes/api/jira-media.$id.ts` as a TanStack Start file-route.
  - Handler: extracts `id` from URL params; runs `appRuntime.runPromise` against an `Effect<MediaStream, MediaResolutionError | MediaNotFound, JiraGateway>` built from `JiraGateway.streamMedia(id)`.
  - Maps the result to a `Response`:
    - Success: `new Response(stream, { status: 200, headers: { 'Content-Type': mimeType, 'Content-Length': contentLength?.toString() ?? undefined } })`.
    - `MediaNotFound`: `new Response('Media not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })`.
    - `MediaResolutionError` from upstream `401/403`: `new Response('Upstream auth error', { status: 502, headers: { 'Content-Type': 'text/plain' } })`.
    - `MediaResolutionError` from upstream `5xx` or network: `new Response('Upstream error', { status: 502, ... })`.
    - Unhandled defect: `new Response('Internal error', { status: 500, ... })`. Logged.
- **New `dependency-cruiser` rules** in `.dependency-cruiser.cjs`:
  - `api-routes-cant-import-server-functions` — `src/routes/api/*` cannot import from `src/server/server-functions/*`.
  - `api-routes-cant-import-wire` — `src/routes/api/*` cannot import from `src/server/wire/*`.
  - `non-api-routes-cant-import-api` — `src/routes/<anything-not-api>/*` cannot import from `src/routes/api/*`.
  - `client-cant-import-api-routes` — `src/contexts/*`, `src/widgets/*`, `src/coordinator/*`, `src/kernel/*` cannot import from `src/routes/api/*`.
  - All rules at `error` severity.
- **ADR** `docs/adr/0006-binary-stream-api-routes.md` already drafted in the grill conversation. This slice merges it as-is alongside the implementation.
- **Doc updates** already drafted in the grill conversation:
  - `CONTEXT-MAP.md`: new layer in the folder layout, new dependency-law edges, new "API route handler" row in the server-side layer-vocabulary table, paragraph in the server-architecture section pointing to ADR-0006.
  - `src/contexts/detail/CONTEXT.md`: updated language section + ADF rendering notes (parts referencing media `attrs.url`/`mimeType` enrichment).
  - `src/server/contexts/detail/CONTEXT.md`: updated `loadIssue` description, `getMediaMetadata` listed in gateway dependencies, `enrichAdfWithMedia` described in the Domain section.
- **`docs/architecture.svg`** regenerated and committed via `pnpm docs:arch`.
- **No client changes required.** The existing `Media.tsx` already renders `<img>` when `attrs.url` is present. After this slice, real Jira images appear inline against real data. The lightbox + button-wrapped preview + video + error chip land in slice 72.

## Acceptance criteria

- [ ] `JiraGatewayShape` declares `getMediaMetadata` and `streamMedia` with the documented signatures.
- [ ] `MediaMetadata` and `MediaStream` types are exported from `src/server/gateways/jira/types.ts`.
- [ ] `MediaResolutionError` and `MediaNotFound` `Schema.TaggedError` classes exist and are part of the Jira gateway's error union.
- [ ] HTTP adapter implements both methods. Status mapping (`404 → MediaNotFound`, `401/403/5xx`/network → `MediaResolutionError`) tested via `it.effect`.
- [ ] `enrich-adf-with-media.ts` exports a pure walker. Tests cover: top-level media, media nested in paragraphs/lists/blockquotes/panels/mediaGroup/mediaSingle, missing-id passthrough, non-media-node passthrough, immutability, null/empty ADF.
- [ ] `loadIssue` collects media ids across `description` and every comment body, calls `getMediaMetadata` once with the bulk list, applies the walker, and returns the enriched issue.
- [ ] `loadIssue` does not fail when `getMediaMetadata` fails entirely (degrades to no enrichment, logged at WARN).
- [ ] `loadIssue` does not fail when individual ids are missing from the metadata response (those nodes pass through un-enriched).
- [ ] `src/routes/api/jira-media.$id.ts` exists, is registered by TanStack Start file-routing, and serves binary on success.
- [ ] The route returns `200` (binary), `404` (`MediaNotFound`), `502` (upstream auth or transport), `500` (defect) with plain-text bodies and the right `Content-Type` headers.
- [ ] Four new dependency-cruiser rules at `error` severity codify the new layer's allowed and forbidden import edges.
- [ ] `docs/adr/0006-binary-stream-api-routes.md` is committed.
- [ ] `CONTEXT-MAP.md`, `src/contexts/detail/CONTEXT.md`, and `src/server/contexts/detail/CONTEXT.md` are updated as drafted.
- [ ] `docs/architecture.svg` is regenerated.
- [ ] Real Jira images and videos in HDR tickets render inline (visible smoke check during PR review against a real ticket).
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test && pnpm test:e2e` all green.

## Blocked by

None — can start immediately.

# 73 — Jira media gateway: replace phantom `/media-tokens` with real Jira Cloud attachment endpoints

**Type:** AFK

## Parent

[ADF rendering extensions PRD](../prds/adf-rendering-extensions.md)

## What to build

Bug fix on top of slice 71. The current `JiraGateway.getMediaMetadata` and `streamMedia` implementations call **`POST /rest/api/3/media-tokens`**, which does not exist in Jira Cloud's public REST API. Against real Jira every metadata request fails with 404; `loadIssue`'s `Effect.catchAll` silently demotes the failure to "no enrichment", the `mediaUrlMap` ends up empty, and every `media` ADF node renders as the legacy "Media hosted in Jira" placeholder. The unit tests pass because they mock the phantom endpoint.

After this slice merges, the gateway uses Jira Cloud's actual attachment endpoints — `GET /rest/api/3/attachment/metadata/{id}` for metadata and `GET /rest/api/3/attachment/content/{id}?redirect=false` for binary — and real images and videos in HDR tickets render inline.

This bug came from a wrong premise in the grill conversation that produced ADR-0006: the document described a `/media-tokens` token-bundle flow that does not match Jira Cloud's public REST API. The implementation, the gateway tests, and the ADR's technical-reference paragraph were all built on that wrong premise. This slice corrects all three.

Scope note: ADF media nodes whose `id` matches an issue attachment ID are the common case (screenshots dragged into descriptions or comments). Media that lives outside the attachment system — for example, media inserted via Confluence smart-link cross-product — falls outside this fix and continues to render the placeholder. Acceptable for Phase 1; a future slice can extend with Atlassian Media Services if the placeholder ever becomes a problem against HDR's data.

Concretely:

- **`http-adapter.ts` rewrite — `getMediaMetadata`**:
  - Drop the `POST /rest/api/3/media-tokens` call and the `MediaTokensResponse` type.
  - Fan-out per id: `GET /rest/api/3/attachment/metadata/{encodeURIComponent(id)}` using the existing basic-auth + `Accept: application/json` headers. `Effect.all({ concurrency: 5 })` bounds the fan-out for issues with many attachments.
  - Each per-id call shapes the JSON body into `MediaMetadata`. The Jira metadata response carries `mimeType` (string) plus `size`, `filename`, `created`, `author`, and `content` (a download URL we don't need). Map only `id` and `mimeType` into our shape (plus `width`/`height` if the response carries them — Jira returns these for image attachments via the embedded image-properties block; absent for non-image attachments).
  - Per-id 404 → drop the entry from the result silently (the walker already handles missing ids by leaving the node un-enriched). Other failures (401/403/5xx/network) → `MediaResolutionError` with the upstream status.
  - Empty `ids` continues to short-circuit to `Effect.succeed([])` without making any HTTP calls.
- **`http-adapter.ts` rewrite — `streamMedia`**:
  - Drop the two-step token-then-binary flow.
  - Single `GET /rest/api/3/attachment/content/{encodeURIComponent(id)}?redirect=false` with the existing basic-auth headers.
  - `200` (or `206` partial content for ranged requests) → `MediaStream` from `response.stream` + `Content-Type` header + optional `Content-Length` header.
  - `404` → `MediaNotFound`.
  - `401`/`403`/`5xx`/network → `MediaResolutionError` with the upstream status.
  - The `?redirect=false` query parameter asks Jira to stream bytes directly rather than `303 See Other`-redirecting to a media-services CDN; this keeps the proxy simple and avoids a second hop.
- **Optional: forward the browser's `Range` header** through the `/api/jira-media/<id>` route into `streamMedia` so HTML5 video seek works against large files. The Jira attachment endpoint supports `Range`. If this turns out to need plumbing changes in the route handler too, defer to a follow-up slice — Phase 1 can ship without seek support.
- **`http-adapter.test.ts` rewrite — gateway tests**:
  - Replace every `media-tokens` mock with mocks for `GET /rest/api/3/attachment/metadata/<id>` and `GET /rest/api/3/attachment/content/<id>`.
  - `getMediaMetadata` cases: empty ids → no HTTP; multiple ids → multiple GETs to the metadata endpoint with the right Authorization header; per-id 404 dropped from the result; aggregate 401 → `MediaResolutionError`; bulk happy path returns the right `MediaMetadata[]`.
  - `streamMedia` cases: 200 with stream + headers → `MediaStream`; 404 → `MediaNotFound`; 401 → `MediaResolutionError`; the request URL includes `?redirect=false`.
- **ADR-0006 correction** in `docs/adr/0006-binary-stream-api-routes.md`:
  - The "ADF media enrichment" section describes a `/rest/api/3/media-tokens` token-bundle flow. Replace with the real Jira Cloud attachment-endpoint flow (`GET /rest/api/3/attachment/metadata/<id>` per id, fan-out concurrency-bounded; `GET /rest/api/3/attachment/content/<id>?redirect=false` for the binary).
  - The "Policy menu (caching)" math currently reads "1 token call + 1 metadata call regardless of N" — correct to "N concurrency-bounded metadata calls (no separate token call needed)" and update the upgrade-path note (the rate-limit ceiling is reached sooner per N attachments since the metadata calls are no longer bulked).
  - The rest of the ADR's content (the new layer, the dependency-cruiser rules, the error mapping table, the proxy route's structure) stays valid — the bug is purely in the technical reference for which Jira endpoints the gateway calls.
- **`docs/architecture.svg` does not change** — no layer or import-graph changes from this slice.
- **No client-side changes.** `Media.tsx`, `MediaLightbox`, the proxy route, and the walker all continue to work as written; they consume `attrs.url` and `attrs.mimeType`, which the corrected gateway now actually populates.
- **Manual verification against real HDR data** is the gate. After the PR opens, check at least one HDR ticket with an inline screenshot and at least one with an inline video; both should render as clickable previews and open in the lightbox.

## Acceptance criteria

- [ ] `getMediaMetadata` no longer calls `POST /rest/api/3/media-tokens`. It fans out `GET /rest/api/3/attachment/metadata/{id}` per id with `Effect.all({ concurrency: 5 })`.
- [ ] `streamMedia` no longer calls `POST /rest/api/3/media-tokens`. It calls `GET /rest/api/3/attachment/content/{id}?redirect=false` with the existing basic-auth headers and returns `MediaStream` from response stream + headers.
- [ ] Per-id `404` from the metadata endpoint is dropped from the result silently (existing walker fallback handles missing ids).
- [ ] `404` from the content endpoint maps to `MediaNotFound`. `401`/`403`/`5xx`/network maps to `MediaResolutionError` with the upstream status.
- [ ] Empty `ids` to `getMediaMetadata` short-circuits to `Effect.succeed([])` without any HTTP call.
- [ ] `MediaTokensResponse` type is removed from `http-adapter.ts` along with the `fetchMediaTokens` and `fetchMediaBinary` helpers in their token-bundle form.
- [ ] `http-adapter.test.ts` mocks the real endpoints (`/rest/api/3/attachment/metadata/<id>`, `/rest/api/3/attachment/content/<id>`). All previously-passing test cases still pass against the corrected mocks; new cases cover per-id 404 dropping and the `?redirect=false` query parameter.
- [ ] `docs/adr/0006-binary-stream-api-routes.md`'s technical-reference paragraph (the "ADF media enrichment" section) is corrected to describe the actual Jira Cloud attachment endpoints. The "Policy menu (caching)" math is corrected.
- [ ] Manual verification against a real HDR ticket with at least one inline image attachment shows the image rendering inline as a clickable preview, opening in the 95vh × 95vw lightbox.
- [ ] Manual verification against a real HDR ticket with at least one inline video attachment shows the video rendering as a poster preview, opening in the lightbox, autoplaying muted.
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test && pnpm test:e2e` all green.

## Blocked by

- [71 — Server-side Jira media proxy + ADF media enrichment](./71-server-jira-media-proxy.md) (already merged; this slice replaces the phantom-endpoint implementation it shipped with)

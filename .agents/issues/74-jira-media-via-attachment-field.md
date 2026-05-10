# 74 — Jira media: enrich ADF via the issue's `attachment` field (drop `getMediaMetadata`)

**Type:** AFK

## Parent

[ADF rendering extensions PRD](../prds/adf-rendering-extensions.md)

## What to build

Bug fix on top of slices 71 and 73. After slice 73, real HDR tickets still render every `media` node as the legacy "Media hosted in Jira" placeholder. Empirical evidence against `HDR-18525` (gathered with playwright + curl against the live tenant):

- **ADF `media` nodes carry Atlassian Media Services UUIDs in `attrs.id`** (`5d9cd289-a971-42a5-b5d7-8ba48a3404f5`, etc.) plus the original filename in `attrs.alt`. They do **not** carry the integer Jira attachment id — the slice-73 premise that "ADF media nodes whose `id` matches an issue attachment ID are the common case" is empirically false; even simple screenshots dragged into the description use UUIDs.
- The Jira-Cloud attachment endpoint that slice 73 fans out — `GET /rest/api/3/attachment/metadata/<id>` — **does not exist in Jira Cloud** despite being documented in the OpenAPI reference. Both `/metadata/<UUID>` and `/metadata/<integerId>` return `404 No endpoint GET …`. The metadata endpoint that actually exists is `GET /rest/api/3/attachment/<id>` (no `metadata/` segment).
- `GET /rest/api/3/attachment/content/<integerId>?redirect=false` does work and streams bytes correctly; `streamMedia` is already correct **once it receives an integer attachment id**.
- The issue's `attachment` field — already part of the standard issue payload — carries `{ id, filename, mimeType, ... }` with the integer ids. `expand=renderedFields` confirms this is the same correlation Jira's own UI uses: rendered HTML rewrites every ADF media node to `<img src=".../attachment/content/<integerId>">`, with the integer id resolved by filename match against the issue's attachment list.

So the right fix is structurally different from what slice 73 prescribed. The metadata we need rides along on the issue payload for free; there is no separate metadata round-trip and no gateway method needed for it. The walker correlates ADF media → attachment by filename (`attrs.alt`).

After this slice merges, real images and videos in HDR tickets render inline. `getMediaMetadata` is removed from the gateway port (no caller after this slice). `streamMedia` continues unchanged.

Concretely:

- **`types.ts` extension** in `src/server/gateways/jira/`:
  - Add a `RawAttachment` type matching the Jira `fields.attachment[]` element shape we actually depend on: `{ id: string; filename: string; mimeType: string }`. (Other fields — `author`, `created`, `size`, `content`, `thumbnail` — are present in the response but not consumed.)
  - Extend `RawDetailedIssue['fields']` with `attachment?: RawAttachment[]`.
  - Drop `MediaMetadata` (no longer the walker's input shape) and replace with an internal `AttachmentRef = { attachmentId: string; mimeType: string }` colocated near the walker — only the walker and `loadIssue` need it. `MediaStream` stays.
- **`port.ts` cleanup** in `src/server/gateways/jira/`:
  - Remove `getMediaMetadata` from `JiraGatewayShape` and from the gateway interface. `streamMedia` stays exactly as today.
  - The `MediaResolutionError` tagged error stays — it is still used by `streamMedia` and the API route's error mapping.
- **`http-adapter.ts` cleanup**:
  - Remove `fetchAttachmentMetadata`, `shapeAttachmentMetadata`, and the `getMediaMetadata` field from the `JiraGateway.of({...})` return value.
  - Keep `fetchAttachmentContent`, `decodeMediaBinary`, `mediaResolutionFromStatus` (still used by `streamMedia`).
- **`http-adapter.test.ts` cleanup**:
  - Remove the entire `JiraGatewayLive — getMediaMetadata` describe block.
  - Keep the `JiraGatewayLive — streamMedia` describe block unchanged — those tests still validate the live `streamMedia` behaviour.
- **`enrich-adf-with-media.ts` rewrite** in `src/server/contexts/detail/domain/`:
  - Walker signature changes from `(adf, mediaUrlMap: Map<string, MediaMetadata>)` keyed by ADF media UUID to `(adf, attachmentByFilename: ReadonlyMap<string, AttachmentRef>)` keyed by filename.
  - For every `media` node:
    - Read `attrs.alt` (the filename Jira embeds in the ADF). Look it up in the map.
    - On hit: return a new node with `attrs.url = '/api/jira-media/<attachmentId>'` and `attrs.mimeType = <attachment.mimeType>`. Note `attachmentId` is the **integer attachment id** rendered as a string, **not** the UUID.
    - On miss: pass through unchanged (existing placeholder behaviour).
  - `attrs.id` is no longer read by the walker. The UUID stays in the node payload — it is harmless and may be useful for downstream renderers — but it is not load-bearing.
  - `collectMediaIds(adf)` is renamed to `collectMediaFilenames(adf): readonly string[]`. It walks the same way but pushes `attrs.alt` (when string) instead of `attrs.id`. The output is currently only used to early-exit when the ADF has no media; after this rewrite it is also useful as the look-up keyset, but the existing "early return when empty" semantics are preserved.
  - Filename collisions inside one issue: documented as a known Phase 1 limitation. The walker takes the **first** attachment for each filename when building the map; subsequent attachments with the same filename render as the placeholder. (Justification: collisions are rare in practice; the worst case is one media rendering as the placeholder rather than the wrong content.)
- **Domain test rewrite** `enrich-adf-with-media.test.ts`:
  - Replace every UUID-keyed map fixture with filename-keyed maps.
  - Cover: filename match injects `url`/`mimeType` with the integer id; missing-filename pass-through; `attrs.alt` absent / non-string pass-through; nested media in paragraphs / lists / blockquotes / mediaSingle / mediaGroup; immutability; null/empty ADF.
- **`load-issue.ts` orchestration rewrite** in `src/server/contexts/detail/application/`:
  - Add `'attachment'` to `DETAIL_ISSUE_FIELDS`.
  - Drop the `collectIssueMediaIds` → `getMediaMetadata` → `Effect.catchAll` block.
  - Build `attachmentByFilename: Map<string, AttachmentRef>` directly from `detailed.fields.attachment ?? []`, deduping on filename (first-wins).
  - Pass the map to `enrichAdfWithMedia` exactly as today, applied to `description` and to each `comments[].body`.
  - When the map is empty (no attachments on the issue), short-circuit and return the un-enriched issue. No extra fetch, no log line.
  - The wire shape is unchanged — `attrs` already accepts string fields, so adding `url`/`mimeType` requires no type-system change at the boundary.
- **Application test rewrite** `load-issue.test.ts`:
  - Faked `JiraGateway` whose `getIssue` returns a `RawDetailedIssue` with `fields.attachment` populated and a description containing two media nodes (one with a matching filename, one with a non-matching filename). Asserts the matching node is enriched with `url: /api/jira-media/<integerId>` and the right `mimeType`; the non-matching node passes through.
  - Faked `JiraGateway` whose `getIssue` returns no `attachment` field. Asserts the issue still loads with media nodes un-enriched and no spurious calls beyond the existing two.
  - Drop the existing `getMediaMetadata`-faked test cases.
- **API route** `src/routes/api/jira-media.$id.ts`: **no change**. The handler already passes `params.id` through to `streamMedia`; with the walker injecting integer attachment ids into `attrs.url`, the route receives integer ids and the gateway call works as-is.
- **`Media.tsx`, `MediaLightbox`**: **no change**. They already consume `attrs.url` / `attrs.mimeType`.
- **Doc updates**:
  - `docs/adr/0006-binary-stream-api-routes.md` — third (and hopefully final) correction:
    - "ADF media enrichment" section: replace the per-id `getMediaMetadata` fan-out description with the filename-mapped lookup against `fields.attachment`. The walker's signature and the gateway-method enumeration both change.
    - "The two new `JiraGateway` methods" code block: remove `getMediaMetadata`. The remaining method is `streamMedia`. Adjust the surrounding paragraph.
    - "Policy menu (caching)" math: `loadIssue` now makes **zero** dedicated media-metadata calls — the attachment list rides along on the existing `getIssue`. The proxy route makes 1 `attachment/content/<id>?redirect=false` call per media open. A panel with M media nodes opened, one media clicked, panel closed: **1 Jira call** for the issue load (already counted) plus 1 per media open. The metadata-cache row in the Phase-1/upgrade-path table is removed; the section may shrink to a single sentence noting that no dedicated media caching is needed at Phase 1 since metadata is co-fetched.
    - The "Why this is a separate ADR" and the dependency-cruiser rules and the error mapping table all stay valid.
  - `src/server/contexts/detail/CONTEXT.md`:
    - The `loadIssue` paragraph currently describes the `getMediaMetadata` step and `/rest/api/3/media-tokens`. Rewrite to describe: read `fields.attachment`, build filename-keyed map, apply walker. Drop the `/rest/api/3/media-tokens` reference.
    - The "Gateway dependencies" paragraph removes `getMediaMetadata`; `streamMedia` stays as a sibling consumed only by the API route.
    - The `enrichAdfWithMedia` paragraph in the Domain section updates the signature and key (filename, not UUID).
  - `CONTEXT-MAP.md`: any sentence that names `getMediaMetadata` as an existing gateway method gets updated. Other layer/edge content is unaffected.
- **MSW e2e fixture** in `tests/e2e/mocks/handlers.ts`: drop the `GET /rest/api/3/attachment/metadata/:id` handler (added in slice 73). The e2e seeds `attrs.url` directly on its ADF media nodes, so neither the production wire nor the new attachment-field path is exercised by e2e — no replacement handler needed. The seeded URLs continue to land on the `/api/jira-media/<id>` MSW handler that already exists.
- **`docs/architecture.svg` does not change** — no layer or import-graph changes from this slice.
- **Manual verification against real HDR data** is the gate.

## Architecture rationale

This slice does not introduce a layer or relax a rule. It collapses a mistakenly-introduced gateway method (`getMediaMetadata`) and lets the metadata flow through the existing `getIssue` call. The result is **stricter** adherence to the existing architecture, not looser:

- One fewer atomic gateway method to keep tested and documented.
- One fewer cross-system fan-out per `loadIssue` (N concurrency-bounded metadata calls → 0).
- The walker stays pure; the orchestration stays in the application service; the gateway stays atomic.
- No new layer; no dependency-cruiser rule changes; no ADR added (only correcting the technical reference of the existing ADR-0006).

The filename-match limitation is a real constraint, not an architectural compromise: even Jira's own UI does this match. Filename collisions inside one issue degrade gracefully to the placeholder.

## Acceptance criteria

- [ ] `JiraGatewayShape` no longer declares `getMediaMetadata`. `streamMedia` is unchanged.
- [ ] `MediaMetadata` type is removed from `src/server/gateways/jira/types.ts`. `MediaStream` stays.
- [ ] `RawDetailedIssue['fields']` includes `attachment?: RawAttachment[]` and `RawAttachment` exposes `{ id: string; filename: string; mimeType: string }`.
- [ ] `http-adapter.ts` no longer contains `fetchAttachmentMetadata` / `shapeAttachmentMetadata`. The `streamMedia` implementation is byte-for-byte unchanged.
- [ ] `http-adapter.test.ts` no longer has the `getMediaMetadata` describe block. The `streamMedia` describe block is unchanged.
- [ ] `enrich-adf-with-media.ts` exports a walker keyed by filename; `attrs.url` is set to `/api/jira-media/<integerAttachmentId>` and `attrs.mimeType` is taken from the matching attachment record.
- [ ] `enrich-adf-with-media.test.ts` covers the documented cases (filename hit, miss, missing alt, nested media, immutability, null/empty).
- [ ] `loadIssue` requests `attachment` as part of the issue fields, builds the filename-keyed map directly from `fields.attachment`, and passes it to the walker. No `getMediaMetadata` call remains in the application service.
- [ ] `load-issue.test.ts` covers the new orchestration: enrichment based on `fields.attachment` (matching + non-matching media); issue without `attachment` field still loads.
- [ ] `docs/adr/0006-binary-stream-api-routes.md` is corrected (ADF-media-enrichment section, the gateway-methods code block, the Policy-menu math).
- [ ] `src/server/contexts/detail/CONTEXT.md` and `CONTEXT-MAP.md` no longer reference `getMediaMetadata` or `/rest/api/3/media-tokens`.
- [ ] The MSW handler for `GET /rest/api/3/attachment/metadata/:id` (added in slice 73) is removed from `tests/e2e/mocks/handlers.ts`. Existing e2e specs continue to pass unchanged.
- [ ] Manual verification against `HDR-18525` (or any HDR ticket with at least one inline image and one inline video) shows both rendering as clickable previews and opening in the lightbox.
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test && pnpm test:e2e` all green.

## Out of scope

- Filename-collision handling beyond first-wins. A future slice could disambiguate via per-comment `attachment` arrays or by walking the rendered-HTML mapping under `expand=renderedFields`, if collisions ever turn up against HDR data.
- Cross-issue / Confluence-smart-link media (the small minority where `attrs.alt` does not match any attachment on the host issue). Those continue to render the placeholder, same as today.
- Any changes to the API route, the lightbox, the proxy headers, or `Range` support. Those are addressed by separate slices if and when they become observable problems.

## Blocked by

- [71 — Server-side Jira media proxy + ADF media enrichment](./71-server-jira-media-proxy.md) (merged)
- [73 — Jira media gateway: replace phantom `/media-tokens` with real Jira Cloud attachment endpoints](./73-jira-media-real-endpoints.md) (merged; this slice replaces its enrichment approach with the correct one)

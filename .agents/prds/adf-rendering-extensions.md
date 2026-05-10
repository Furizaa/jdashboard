# clashboard — ADF rendering extensions: inline cards, syntax-highlighted code blocks, media lightbox

## Problem Statement

When I open a Jira ticket in clashboard's side panel today, large parts of the description and comment thread render as opaque placeholders. **Inline cards** — Jira's smart links, which in HDR's data are overwhelmingly cross-references to other Jira issues — fall through to the unsupported-node fallback, so cross-references like "this is blocked by HDR-447" appear as `[unsupported: inlineCard]`. **Code blocks** render as plain monospace, so a 30-line stack trace and a JavaScript snippet look the same — no language affordance, no token coloring, no readable structure. **Images and videos** render as a "Media hosted in Jira" placeholder regardless of what was attached, because the renderer expects a `url` attribute that real Jira ADF never provides; the actual bytes live behind tokenised media-services URLs that the server has not been wired to resolve.

The combined effect is that the side panel is good for prose but not for everything-else, and "everything else" is exactly the content that links one ticket to another, that captures the technical detail of a bug, or that shows what the bug actually looks like. The result is that I open Jira in a separate tab to see what I came to clashboard to see.

## Solution

Extend the Detail panel's ADF renderer to handle the three node families above, and resolve the underlying server-side data plumbing for media so the renderer has something to render.

- **Inline cards** are detected client-side by URL shape. URLs matching the issue's own Jira host root (`<jiraBaseUrl>/browse/<KEY>`) render as a Jira-blue chip showing `<KEY>`. All other URLs render as a muted globe-icon chip showing `host + path`. Clicking either opens the URL in a new tab.
- **Code blocks** with a recognised `language` attribute render with **Shiki** syntax highlighting against the **catppuccin-mocha** theme — the same engine VS Code uses, the same look Linear's docs use. Code blocks with no language, or a language outside the curated allowlist, render as today's plain monospace block. The highlighter and per-language grammars are loaded **on demand** so they do not appear in the initial bundle.
- **Media** (images and videos) renders as a clickable preview. Clicking opens a lightbox modal sized to 95% of the viewport that displays the image at native resolution or plays the video. The server walks every ADF tree at load time and rewrites each `media` node's `attrs` to include a stable proxy URL (`/api/jira-media/<id>`) and the resolved `mimeType`; the browser fetches both bytes via a new HTTP-shaped server endpoint that re-resolves Jira's short-lived media tokens on every request, so a panel left open past token expiration still works on click.

## User Stories

### Inline cards

1. As a developer reading an issue description, I want a `<jiraBaseUrl>/browse/HDR-447` URL to render as an `HDR-447` chip, so that I can see at a glance which other ticket is being referenced without parsing the URL.
2. As a developer, I want the Jira issue chip to use a subtle Jira-blue accent distinct from plain text, so that cross-references are visually findable when I scan a paragraph.
3. As a developer, I want the Jira issue chip to be clickable and open in a new tab, so that I can pivot to the referenced ticket without losing my place in the current panel.
4. As a developer, I want non-Jira URLs (Confluence, GitLab, GitHub, arbitrary websites) to render as a muted chip showing the URL's host plus path, truncated at roughly 40 characters, so that I can identify the link's destination at a glance without the chip dominating the paragraph.
5. As a developer, I want every inline-card chip to render inline within the surrounding paragraph (not as a block), so that the prose flow is preserved.
6. As a developer, I want inline-card detection to work the same way inside comment bodies as inside the issue description, so that comments referencing other tickets render the same chips.
7. As a developer, I want an inline card whose URL is malformed or unparseable to fall back to the plain-URL chip rather than crash the renderer, so that one bad node never blanks the panel.

### Code blocks with syntax highlighting

8. As a developer reading a bug report with a JavaScript snippet, I want the snippet rendered with token-level syntax highlighting, so that I can read the code at a glance instead of parsing strings vs. keywords manually.
9. As a developer, I want the highlighting to use the catppuccin-mocha theme, so that code reads with a calm, dark, Linear-adjacent palette consistent with the rest of clashboard.
10. As a developer, I want code blocks for at least JavaScript, TypeScript, TSX/JSX, Python, Go, Rust, Java, Kotlin, C#, C++, SQL, JSON, YAML, XML, HTML, CSS, Bash/Shell, Markdown, and Dockerfile, so that the languages I see in HDR tickets all light up.
11. As a developer, I want common language aliases (`js`, `ts`, `py`, `sh`, `cs`, `c++`) to be recognised as their canonical languages, so that ticket authors don't have to remember the exact string Shiki expects.
12. As a developer, I want code blocks with no language tag, or with a language outside the allowlist, to render as today's plain monospace block, so that an unexpected language never breaks the layout.
13. As a developer, I want code blocks to keep their horizontal scroll affordance for long lines, so that wide stack traces stay readable on narrow side panels.
14. As a developer, I want syntax highlighting to apply equally to code blocks inside comments and inside the description, so that a `console.log` snippet pasted into a comment is as readable as one in the description.
15. As a developer, I want the highlighter to load only when the panel I open contains at least one code block with a recognised language, so that opening a code-free ticket does not pay any download cost for the highlighter.
16. As a developer, I want individual language grammars to load on demand the first time that language appears, so that opening a ticket with one Python snippet only downloads the Python grammar — not Java, Rust, Go, etc.
17. As a developer, I want the code block to render in its plain form first and then upgrade to the highlighted form once the grammar arrives, so that I never see a flash of empty space while Shiki initialises.

### Media: in-document presentation

18. As a developer, I want images attached to a Jira issue to render inline in the description and in comments at their natural aspect ratio, capped at the panel's content width, so that I can see the screenshot in context.
19. As a developer, I want videos attached to a Jira issue to render inline as a poster preview (the first frame) with a play-icon overlay rather than as an in-flow native video player with controls, so that the inline interaction surface stays simple — one click opens the lightbox.
20. As a developer, I want the inline media preview to be a single clickable target (the entire image or video frame plus its overlay), so that I do not have to hunt for an "expand" button to view it larger.
21. As a developer, I want the inline preview's clickable target to be a real `<button>` for keyboard activation and screen-reader semantics, so that Tab + Enter opens the lightbox just as well as a mouse click.
22. As a developer, I want media inside a `mediaGroup` to lay out as a horizontal flex row with consistent gaps, so that grouped attachments read as a gallery rather than a stack.
23. As a developer, I want a media node whose server-side resolution failed (deleted attachment, transient upstream error) to fall back to the existing "Media hosted in Jira" placeholder with an Open-in-Jira link, so that one broken attachment never blanks the description.
24. As a developer, I want the `<img>` and `<video>` `onerror` event to swap the element to a small inline error chip ("Media unavailable") with an Open-in-Jira link, so that a token expiry or a transient proxy failure surfaces cleanly rather than as a broken-image icon.

### Media: lightbox modal

25. As a developer clicking on an inline image, I want a centred modal at 95% of the viewport's height and width to open with the image scaled to fit (preserving aspect ratio), so that I can see screenshot detail without leaving clashboard.
26. As a developer clicking on an inline video, I want the same 95vh × 95vw modal to open with the video playing automatically, muted, with native HTML5 controls, so that I can preview a clip with a single click and unmute via the controls if I want sound.
27. As a developer, I want the lightbox to close when I press `Escape`, so that dismissing matches every other modal I use.
28. As a developer, I want the lightbox to close when I click the backdrop area outside the media, so that dismissing is a single click anywhere safe.
29. As a developer, I want a visible close (`×`) button in the lightbox, so that I can dismiss with the mouse without aiming at the backdrop.
30. As a developer, I want pressing `Escape` to close _only_ the lightbox (without also closing the surrounding ticket-detail panel), so that one keystroke does one thing.
31. As a developer, I want the panel's J/K (next/prev sibling) and O/C (open in Jira / copy link) keyboard shortcuts to be inert while the lightbox is open, so that browsing media never accidentally navigates the panel away from the ticket I am viewing.
32. As a developer, I want focus to be trapped inside the lightbox while it is open and returned to the originating preview button when it closes, so that keyboard navigation is unsurprising.
33. As a developer, I want the lightbox to render the same error chip as the inline view if the proxy fetch fails after the modal opens, so that the modal does not show a broken-image icon.

### Server-side media resolution

34. As a developer, I want the dashboard server to fetch metadata for every `media` node attached to an issue's description and comments at the moment the issue loads, so that the client has the resolved `mimeType` it needs to choose between image and video rendering without an extra round-trip per node.
35. As a developer, I want the dashboard server to inject a stable proxy URL (`/api/jira-media/<id>`) into each `media` node's attributes before the issue payload reaches the browser, so that the client renderer remains a pure transformation of ADF and never speaks to Jira's media-services API directly.
36. As a developer, I want the proxy endpoint to re-resolve a fresh Jira media token on every request, so that a panel left open for an hour still loads media on click without the user noticing the token had expired.
37. As a developer, I want the proxy endpoint to stream binary bytes through with the resolved `Content-Type` and `Content-Length` headers, so that the browser handles `<img>` and `<video>` (including video range requests) natively.
38. As a developer, I want the proxy endpoint to return an honest HTTP status for upstream failures — `404` if Jira reports the attachment is gone, `502` for upstream auth or transport failures, `500` for unhandled defects — so that the browser's native `onerror` handler triggers consistently.
39. As a developer, I want `loadIssue` to never fail just because one media node was unresolvable, so that a single deleted attachment cannot prevent me from seeing the rest of the ticket.
40. As a developer, I want the metadata-resolution failure for an individual node to leave that node un-enriched (so the client renders the existing placeholder), so that the failure mode is graceful and visible rather than silent.
41. As a developer, I want server-side ADF enrichment to walk both the description and every comment body, so that media in long comment threads renders just as well as media in the description.

### Cross-cutting

42. As a developer, I want every change in this PRD to ship behind clashboard's existing CI gates (typecheck, lint, dependency-cruiser, fallow, vitest) without introducing rule exemptions, so that the architecture stays intact.
43. As a developer, I want one new ADR (binary-stream HTTP API routes) to land alongside the implementation, so that the architectural divergence — a server entry point that does not go through the JSON-RPC `toWire` envelope — is documented at the boundary it crosses.
44. As a developer, I want the existing Quick Create modal migrated to the new shared Dialog primitive in the same slice that introduces the lightbox, so that the codebase does not contain two ways to render a dialog.
45. As a developer, I want the existing E2E suite extended with a new spec that exercises image-opens-lightbox, video-opens-and-autoplays-muted, and proxy-error-renders-chip, so that regressions surface before they land.

## Implementation Decisions

### New architectural layer

A new server entry-point layer is introduced for HTTP-shaped responses (binary streams, custom HTTP semantics) that do not fit clashboard's JSON-RPC `toWire` envelope. The first member of the layer is the Jira-media proxy. The layer's rules — what it can import, what it cannot, where its errors map — are codified in a new ADR and as new dependency-cruiser rules. The layer sits alongside the existing JSON-RPC handler namespace; the two coexist, governed by separate rules. Binary-stream endpoints map errors to HTTP status codes, not to tagged-union JSON.

### Server-side modules

- **`JiraGateway` extensions.** Two atomic methods are added to the existing Jira gateway port and its HTTP adapter. `getMediaMetadata` accepts an array of media IDs and returns metadata records (id, mimeType, optional width/height); the implementation makes one bulk token-resolution call followed by one metadata call. `streamMedia` accepts a single media ID and returns a `{ stream, mimeType, contentLength? }` triple suitable for piping to a browser response. Each method handles its own internal token fetch — the token is a hidden gateway concept and never appears in callers.
- **New gateway tagged errors.** `MediaResolutionError` (carries an upstream message and HTTP status) and `MediaNotFound` (no payload). Added to the existing Jira gateway's error union; encoded by `Schema.TaggedError` like every other gateway error.
- **`enrichAdfWithMedia` domain walker.** Pure function in the server-side Detail context's domain layer. Takes an ADF node and a `Map<id, MediaMetadata>`; returns a new ADF node with each `media` node's `attrs` extended by `url` (the proxy URL pointing at the new endpoint) and `mimeType`. Nodes whose id is not in the map pass through unchanged. Walks every level of the tree including content nested inside paragraphs, lists, blockquotes, and panels.
- **`loadIssue` orchestration extension.** The existing application service gains a post-shape step: collect all `media` ids from description + every comment body, batch-call `getMediaMetadata` once, apply the walker, return the enriched payload. Per-id resolution failures degrade silently to "no enrichment" for that id; aggregate metadata-call failures degrade the entire issue to "no media enriched" without failing the issue load. The wire shape is unchanged — `attrs` already accepts arbitrary string/number/boolean/null fields, so adding `url` and `mimeType` requires no type-system change at the boundary.
- **`/api/jira-media/<id>` route handler.** The single first member of the new HTTP-shaped layer. Accepts a media id from the URL path, calls `streamMedia`, and writes a `Response` with the resolved stream, mimeType, and (when known) content length. Maps `MediaNotFound` to `404`, upstream auth errors (`401`/`403` from Jira) to `502`, upstream transport errors (`5xx` and network) to `502`, unhandled defects to `500`. Bodies are plain text for human inspection; the browser's native `onerror` handler triggers on status alone.

### Client-side ADF renderer extensions

- **`InlineCard` view node.** New ADF node component. Receives the `inlineCard` node's URL plus the issue's `jiraBaseUrl` and dispatches through a pure domain function. The function returns a discriminated union (`JiraIssue` for URLs matching `<jiraBaseUrl>/browse/<KEY>`, `PlainUrl` otherwise). The component exhaustively matches the union and renders the corresponding chip component (`JiraIssueChip` shows the issue key on a Jira-blue accent; `PlainUrlChip` shows host + path on a muted accent with a globe icon).
- **`parseInlineCard` domain function.** Pure, takes a URL string and an optional Jira base URL, returns the discriminated union above. Lives in the Detail context's domain layer. Truncates the plain-URL display to roughly 40 characters with a tail ellipsis; strips `https://` and trailing slashes. Returns `PlainUrl` on any URL parsing failure.
- **`HighlightedCode` view node.** New ADF node component for code blocks with a recognised language. Renders the plain `<pre><code>` synchronously, then upgrades to Shiki's HAST output on mount. Loaded as a `React.lazy` module so the highlighter only enters the bundle when needed; wrapped in `Suspense` whose fallback is the plain block. Theme is fixed to catppuccin-mocha.
- **`normalizeCodeLanguage` domain function.** Pure, table-driven map from raw `attrs.language` strings (including aliases like `js`, `ts`, `py`) to canonical Shiki language identifiers. Returns `null` for missing or unrecognised languages, which routes the code block to the existing plain renderer with no JS dependency loaded.
- **`Media` view node refactor.** Renders a click-to-open preview button when the server-enriched `attrs.url` is present; falls back to the existing "Media hosted in Jira" placeholder when it is absent. Image previews render the resolved bitmap inside the button at preview size; video previews render `<video preload="metadata">` (no controls, first frame visible) with a play-icon overlay. Branches on `mimeType.startsWith('video/')`.
- **`MediaLightbox` view component.** Built on the new shared Dialog primitive. Sized to 95vh × 95vw via className override at the call site (no new variant on the primitive). Image content uses `object-contain`; video uses native HTML5 controls with `autoplay muted`. Closes on Escape, backdrop click, and the close button. State is local to the originating `Media` node — no gallery navigation between media in the same panel.
- **`MediaUnavailable` view component.** Small inline error chip rendered when an `<img>` or `<video>` `onerror` fires. Carries an Open-in-Jira link derived from the issue's `jiraBaseUrl`. Used both in-document and inside the lightbox.
- **`LightboxOpenContext`.** A presenter-owned React context whose value is a single boolean. Set to `true` while any `MediaLightbox` is mounted-and-open; the two `window`-level keyboard listeners in the Detail presenter (`useEscapeToClose`, `usePanelShortcuts`) read the context and bail when it's `true`. The context plumbs a coordination signal between the open lightbox and the keyboard handlers — not state. The lightbox's own open/closed state still lives in the originating `Media` node's local `useState`.
- **`RenderAdf` prop rename.** The existing `jiraUrl` prop (the issue's own Jira URL) is renamed and re-shaped to `jiraBaseUrl` (the host root). Both call sites (description in `PanelBody`, every comment body in `Activity`) pass it. The base URL is derived from `LoadIssueOk.baseUrl`, which the server already returns; the rename has no wire impact.

### Shared design-system addition

- **Shadcn Dialog primitive.** Generated via shadcn CLI into the shared `design-system/` namespace per the documented adopt-on-second-use rule (the lightbox is the second use after Quick Create's existing direct Radix usage). Exposes the standard composition surface (`Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`). The existing Quick Create modal is migrated to consume the primitive in the same slice; the codebase ships with one way to render a dialog.

### Stack additions

- New runtime dependency: **Shiki** (the lazy-core entry, loaded with on-demand grammar imports and a single bundled theme). Source-of-truth for syntax highlighting; matches the engine VS Code and Linear's docs use.
- New runtime dependency: the **shadcn/ui Dialog** primitive's underlying packages — already present in the repo via `@radix-ui/react-dialog`, so this is a code-generation step, not a new top-level package.
- No other new runtime dependencies.

### Architectural rules added

- A dependency-cruiser rule forbids the new HTTP-shaped layer from importing the JSON-RPC handler namespace or the wire-boundary helper.
- A dependency-cruiser rule forbids the user-facing route tree from importing the new HTTP-shaped layer.
- A dependency-cruiser rule forbids client-side bounded contexts, widgets, the coordinator, and the kernel from importing the new HTTP-shaped layer (the layer is an entry point, not a library).

### Slice sequencing

Five PRs, in this order, each independently shippable with E2E green at every step:

1. **Inline-card rendering.** Pure client-side. Adds `parseInlineCard` and the `InlineCard` view component; renames `RenderAdf`'s `jiraUrl` prop to `jiraBaseUrl`; threads it through the description and every comment body. No server changes.
2. **Code-block syntax highlighting.** Pure client-side. Adds Shiki dep, `normalizeCodeLanguage`, `HighlightedCode` lazy module, fallback to plain rendering for unknown/missing languages.
3. **Server-side media resolution and proxy.** The architectural slice. Adds the two `JiraGateway` methods, the new tagged errors, the `enrichAdfWithMedia` walker, the `loadIssue` orchestration extension, the new HTTP-shaped layer, the proxy route, the new dependency-cruiser rules, the new ADR. After this slice, real images render inline against real Jira data with no client-rendering changes (the existing `Media` view already renders `<img>` for url-bearing media).
4. **Media lightbox.** Adopts the shadcn Dialog primitive into the shared layer; migrates Quick Create to it; refactors the `Media` view to a button-wrapped preview; adds `MediaLightbox`, `MediaUnavailable`, `LightboxOpenContext`; gates the panel's keyboard listeners on the context.
5. **E2E coverage** for media. New spec covering image-opens-lightbox, video-opens-and-autoplays-muted, and proxy-error-renders-chip; new MSW handlers for Jira's media-services calls. May be folded into slice 4 if convenient.

Slices 1 and 2 are independent of slices 3–5 and may land in parallel. Slices 3, 4, 5 are strictly serial.

## Testing Decisions

### What makes a good test

The existing per-layer rule applies. Pure functions are tested directly with input/output. Application services are tested with hand-rolled fakes provided through `Layer.succeed(...)` — no `vi.mock` of internal modules. View components that are mostly composition are validated by E2E, not unit tests. The TanStack Query, React, and Shiki layers are configuration; we trust the libraries.

### Modules to test (Vitest / @effect/vitest)

- **`parseInlineCard`** — table-driven over URL inputs and a `jiraBaseUrl`. Covers: matching base URL with `/browse/<KEY>` returns `JiraIssue`; matching base URL with a non-browse path returns `PlainUrl`; non-Jira host returns `PlainUrl`; null base URL returns `PlainUrl` for everything; URL parsing failure returns `PlainUrl` with the raw input as display; trailing slash stripping; `https://` stripping; truncation at the configured display length.
- **`normalizeCodeLanguage`** — table-driven. Each canonical language is recognised; each documented alias (`js`, `ts`, `py`, `sh`, `cs`, `c++`) maps to its canonical name; an unknown string returns `null`; `undefined`/empty returns `null`; case is normalised.
- **`enrichAdfWithMedia`** — table-driven. Top-level media nodes get their `url`/`mimeType` injected when keyed in the map; nodes with unknown ids pass through unchanged; nodes nested inside paragraphs, lists, blockquotes, panels, and `mediaGroup`/`mediaSingle` are walked correctly; non-media nodes are unmodified; the function is pure (input ADF is not mutated); empty ADF and null ADF are handled.
- **Jira gateway HTTP adapter — `getMediaMetadata` and `streamMedia`.** `it.effect` against a faked `HttpClient.HttpClient` returning canned media-services responses. Status mapping: `200` produces success; `404` produces `MediaNotFound`; `401`/`403`/`5xx`/network produce `MediaResolutionError` with the correct status field. The bulk-id payload is shaped correctly. The internal token fetch happens before the metadata or binary fetch.
- **`loadIssue` application service (extended).** `it.effect` with a faked `JiraGateway` whose `getMediaMetadata` returns a known map. Asserts the returned `DetailIssue.description` and each comment body have `attrs.url` and `attrs.mimeType` populated for media whose ids are in the map. Asserts media whose ids are not in the map remain un-enriched. Asserts the issue load does not fail when `getMediaMetadata` itself fails entirely.
- **`/api/jira-media/<id>` handler.** Small unit test. Given a faked `JiraGateway.streamMedia` returning a known stream + mimeType + length, the handler returns a `Response` with status `200`, the right `Content-Type`, the right `Content-Length`, and the stream as body. Status mapping cases tested per error tag.

### Modules not unit-tested (covered by E2E or trusted library configuration)

- `InlineCard`, `JiraIssueChip`, `PlainUrlChip` — composition over the pure `parseInlineCard` output; visual; covered by the existing ADF-rendering E2E.
- `HighlightedCode` — Shiki configuration plus React.lazy plumbing; trust both. Verified by opening the running app on a ticket with a code block.
- `Media` (refactored), `MediaLightbox`, `MediaUnavailable` — composition; covered by the new media-lightbox E2E.
- `LightboxOpenContext` and the presenter's gating on it — covered by the E2E case that asserts Escape closes the lightbox without closing the panel.
- The shadcn Dialog primitive — generated boilerplate; trust shadcn.

### End-to-end coverage

- The existing `tests/e2e/ticket-detail/adf-rendering.spec.ts` is extended (or a sibling spec is added) with two cases: an inline-card chip is rendered for a `<jiraBaseUrl>/browse/<KEY>` URL, and a code block with a recognised language renders highlighted markup.
- A new spec covers the media lightbox: image preview opens lightbox on click, video preview opens lightbox and the `<video>` autoplays muted, the lightbox's Escape closes only the lightbox (the surrounding panel stays open), the proxy returning `404` produces the inline error chip in place of the image. New MSW handlers cover Jira's media-tokens and media-binary endpoints.

### Prior art

The existing `RenderAdf.test.tsx`, the per-domain pure-function tests under each context's `domain/`, the gateway HTTP adapter tests under `gateways/jira/`, and the existing `adf-rendering.spec.ts` E2E spec are the templates. No new test infrastructure required.

## Out of Scope

- Smart-link metadata resolution for inline cards. URLs that are not Jira issue cross-references render as a generic chip showing host + path; we do not fetch the linked page's title, favicon, or Open Graph metadata. Adopting Atlassian's smart-link service or rolling our own is a future slice.
- Inline cards beyond the `JiraIssue` / `PlainUrl` heuristic. Recognising Confluence pages, GitLab MRs, GitHub PRs, etc. is a follow-up enrichment to `parseInlineCard`'s discriminated union and is not part of this PRD.
- Multiple themes for syntax highlighting. catppuccin-mocha is hard-coded. A theme picker, light-theme variant, or respecting OS dark-mode preference is a future change.
- Code-block line numbers, copy-to-clipboard buttons, language-label badges, or any non-default Shiki transformer.
- Inline playback for videos. Video plays only inside the lightbox; the in-document preview is non-interactive beyond opening the modal.
- Gallery navigation between media nodes in the same panel. Each lightbox is self-contained; there are no `← / →` arrow keys to step through media. State remains view-local per `Media` node.
- Lifting modal state into the Detail view-model. The view-model remains derivation-only as documented; the lightbox is presenter-coordinated, not state-machine state.
- Token caching at the `JiraGateway` layer. Each call to the gateway re-resolves a fresh Jira media token. A `Cache.make` Layer is the documented upgrade path and lands the day Jira's per-tenant rate limit is hit, not before.
- Media zoom, pan, or multi-touch gestures inside the lightbox. The image is centred and contained; controls are limited to close and (for video) the native HTML5 control surface.
- Mobile-specific layout adjustments for the lightbox or the inline preview. clashboard's audience is a desktop dashboard; mobile is not a target.
- A persistent "media unavailable" indicator at the panel level when the proxy is degraded. Failures surface per-node as the inline error chip in response to the browser's native `onerror`.
- Editing or annotating attached media inside clashboard. The dashboard remains a viewer.
- Showing video duration, byte size, or upload timestamp inline. The wire payload is kept to `url` and `mimeType` only; richer metadata is a future enrichment.
- Cleanup or migration of the existing E2E fixture's fake `attrs.url` field on media nodes. The new `enrichAdfWithMedia` walker will simply pass through nodes that already carry a `url`, and the existing fixture-driven test continues to pass; rewriting the fixture to mirror real Jira shape is not load-bearing for this PRD.

## Further Notes

- The decision to proxy media bytes through a server-mediated URL — rather than embedding Jira's tokenised CDN URL directly — is the load-bearing choice that lets a panel left open past a token's lifetime still load media on click. The trade is bandwidth through clashboard's server, which is acceptable at HDR's scale and which becomes a non-issue if media usage ever justifies a token cache.
- The new HTTP-shaped server layer is the first place clashboard's server has an entry point that does not flow through the JSON-RPC `toWire` envelope. The rules around it (where it can live, what it can import, what it cannot) are the architectural lesson of this PRD; the new ADR states them explicitly so future binary-stream endpoints (file downloads, exports) have a named home rather than getting hacked around `toWire`.
- The "in-document video is a non-interactive preview" choice is deliberately stricter than browsers' default behaviour with `<video controls>`. The reason is the panel's J/K/O/C keyboard shortcuts, which compete with `<video>`'s own focus-handling. By keeping inline videos non-interactive and gating shortcuts via `LightboxOpenContext` while the modal is open, the keyboard contract stays predictable.
- The catppuccin-mocha theme choice is a soft preference rather than a load-bearing decision. The user named Catppuccin during the grill; if the theme later reads as too saturated against the rest of clashboard's palette, swapping it is a one-line change inside `HighlightedCode` with no wire or rule impact.
- The decision to keep the lightbox's open state per-`Media` rather than lifting it to the Detail presenter or view-model is a deliberate cost vs. flexibility trade. It costs the ability to add gallery navigation later without lifting state; in exchange, the view-model's documented "derivation-only" property is preserved and the keyboard-gating context stays a one-bit signal rather than a multi-state machine. If gallery navigation becomes a requirement, the lift is mechanical.
- Per-id resolution failure on media metadata is treated as "leave the node un-enriched" rather than as "fail the issue load." This matches the existing code's posture toward optional fields (a 404 from Jira's sub-issue search is already silently demoted, for example) and ensures one deleted attachment never blocks the rest of the description from rendering.
- The migration of the existing Quick Create modal to the shared Dialog primitive — bundled into the lightbox slice — exists because clashboard's documented architectural rule fires on the second usage and the alternative (leaving the migration as a follow-up) creates a state the rule was written to prevent. The migration is mechanical: Radix's `Dialog.Root → Dialog`, `Dialog.Portal/Overlay/Content → DialogContent`, etc.

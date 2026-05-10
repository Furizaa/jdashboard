# Detail

Renders a single Jira issue in a side panel. Owns the panel's open/close state, ADF rendering, sibling navigation within a column, keyboard shortcuts (J/K/↑/↓/O/C/Esc), the Activity feed, Relationships (parent / sub-issues / linked issues), and the properties rail.

## Language

**IssuePanelState**:
The discriminated union the view-model derives from query data: `closed | loading | error | ready`. `ready` carries the `DetailIssue`, computed `jiraUrl`, sibling navigation keys, and bound action callbacks (`close`, `open`, `openInJira`, `copyJiraLink`).

**DetailIssue** (kernel re-export):
The full issue payload returned by the gateway. Carries description (ADF), comments, links, parent, sub-issues, plus the same fields as `BoardIssue`. The server enriches every `media` node in `description` and `comments[].body` with a proxy `url` (`/api/jira-media/<id>`) and `mimeType` before the wire — see ADR-0006.

**Sibling**:
Another issue in the same column (per `columnForStatus`) of the current board. The `prevKey`/`nextKey` pair drives J/K navigation and the panel header arrows.

**Shortcut action**:
A keyboard event resolved through `shouldHandleShortcut` and the J/K/↑/↓/O/C ladder in the presenter. The presenter applies the resulting effect (`navigate`, `openInBrowser`, `copyJiraLinkAndToast`) directly.

**InlineCardKind** _(domain — `parse-inline-card.ts`)_:
The discriminated union an `inlineCard` ADF node resolves to client-side: `JiraIssue` (URL matches `<jiraBaseUrl>/browse/<KEY>`) or `PlainUrl` (everything else). The view exhaustively matches this and renders the appropriate chip.

**MediaLightbox**:
The Dialog component that opens at 95vh × 95vw when a `Media` preview is clicked. State is view-local per `Media` node — no gallery navigation between media. Image renders with `object-contain`; video renders as native HTML5 `<video controls autoplay muted>`. Closes on Esc, backdrop click, or × button.

**LightboxOpenContext**:
A presenter-owned React context whose value is a single boolean (`true` while any nested `MediaLightbox` is open). The two `window`-level keyboard listeners in the presenter (`useEscapeToClose`, `usePanelShortcuts`) read this context and bail when it's `true`, so panel-level Esc/J/K shortcuts don't fire while a media modal has focus. The context plumbs a coordination signal, not state — the modal's open/closed state still lives in the `Media` node's local `useState`.

_Avoid_: "DetailState" (overloaded — the public surface is `IssuePanelState`), "panel" by itself (it's the view node, not the union), "lightbox state" (there is no lightbox state machine; modal open/closed is local view state).

## Use-cases (application service surface)

The `DetailApplicationService` exposes a small port-mediated surface. The presenter today reads cached data through coordinator hooks (`useTicket`, `useBoardData`); the application service exists for parity with Board and is the seam through which slice 6 will route the cache port.

| Method           | Returns                                        | Notes                                                                                                 |
| ---------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `loadIssue(key)` | `ResultAsync<DetailSnapshot, DetailLoadError>` | Wraps the gateway. `DetailLoadError` is `DetailUnauthorized \| DetailNotFound \| DetailNetworkError`. |
| `refresh(key)`   | `void`                                         | Invalidates the cached issue via the cache port.                                                      |

`DetailLoadError` is three hand-rolled tagged classes (`_tag: 'DetailUnauthorized' \| 'DetailNotFound' \| 'DetailNetworkError'`) per ADR 0004; the consumer unwraps via `result.match` or ts-pattern over the underlying tagged union.

## View-model state machine

Detail's view-model is derivation-only — there is no internal state to fold. The public function is `derive(input) → IssuePanelState`. `input` carries the `issueKey`, a flat view of the issue query (`data | isPending | isError | error`), the current board issues (for sibling derivation), and three injected effects (`navigate`, `openInBrowser`, `copyJiraLinkAndToast`).

The lightbox does **not** lift this rule — modal open/closed is local view state inside each `Media` node, not a derivable union, and `LightboxOpenContext` is a coordination signal between the open lightbox and the presenter's keyboard listeners. The view-model surface is unchanged.

```
issueKey === null                      → closed
issueQuery.isPending                   → loading
issueQuery.data === undefined          → error (network, message wraps error.message)
issueQuery.data.ok === false / unauth  → error ("Invalid Jira credentials.")
issueQuery.data.ok === false / 404     → error ("Issue not found.")
issueQuery.data.ok === true            → ready (issue + jiraUrl + prev/next + bound callbacks)
```

The phase ladder is one `match(...).with(...).exhaustive()` over `issueQuery.data`. Bound callbacks (`close`, `open`, `openInJira`, `copyJiraLink`) close over the injected effects so the view can call them without knowing the side-effect adapter.

## Cross-context dependencies

- `~/kernel` — `BoardIssue`, `DetailIssue`, `IssueLink`, `LinkedIssueRef`, `AdfNode`, `GetIssueResult`, `Column`, `columnForStatus`.
- `~/coordinator` — `useTicket`, `useBoardData`, `useMrFor`, `useReviewCards` (presenter / view layers only).
- `~/lib/use-polling` — visibility-aware refetch interval (presenter only).
- `~/lib/testids` — centralised test ids (view layer only).
- `~/design-system/dialog` — shadcn Dialog primitive used by `MediaLightbox` (and shared with Capture's `QuickCreateModal` per the adopt-on-second-use rule in CONTEXT-MAP).
- `~/widgets/status-pill`, `~/widgets/ticket-card`, `~/widgets/mr-section`, `~/widgets/fixasap-ribbon` — reusable visual surfaces (view layer only). Detail composes the panel-block MR layout from `Mr.Root` + `Mr.ReviewerStack` / `Mr.WarningRow` / `Mr.OpenLink` directly inside `view/PropertiesRail.tsx`.

No imports from `~/contexts/<other>`. Cross-context coordination would go through the coordinator.

## ADF rendering

`view/adf/RenderAdf.tsx` walks the ADF tree and dispatches each node to a sibling `view/adf/nodes/<Node>.tsx` component. The renderer accepts a `jiraBaseUrl` prop (the issue's Jira host root, e.g. `https://hexagon.atlassian.net`) used by inline-card detection and the legacy "Media hosted in Jira" placeholder. Both call sites — `PanelBody` (description) and `Activity` (each comment body) — pass `jiraBaseUrl` derived from `LoadIssueOk.baseUrl`.

Per-node patterns worth knowing:

- **`inlineCard`** dispatches through the pure domain function `parseInlineCard(url, jiraBaseUrl) → InlineCardKind` (in `domain/parse-inline-card.ts`); the view exhaustively matches the union and renders `JiraIssueChip` or `PlainUrlChip`. New URL patterns become new union variants.
- **`codeBlock`** dispatches through `normalizeCodeLanguage(attrs.language) → string | null` (in `domain/normalize-code-language.ts`). `null` → plain `<pre><code>` (existing behaviour, no JS dep loaded). Non-null → `React.lazy`-loaded `HighlightedCode` rendered inside `Suspense` whose fallback is the plain block; **Shiki** runs against the resolved language and the `catppuccin-mocha` theme. Shiki's grammar JS is loaded on-demand per language; the highlighter chunk is **not** in the initial bundle of `/`.
- **`media`** has resolved `url` and `mimeType` in `attrs` after server-side enrichment (ADR-0006). The view renders a click-to-open preview button: image previews show the resolved bitmap; video previews show `<video preload="metadata">` with no controls plus a play-icon overlay. Clicking opens `MediaLightbox`. `mimeType.startsWith('video/')` selects video; otherwise image. Unresolved media (server failed to enrich) fall back to the existing "Media hosted in Jira" placeholder. `<img>` / `<video>` `onerror` swap to `<MediaUnavailable>` (a small inline error chip linking to the issue in Jira).

## Public surface

`src/contexts/detail/index.ts` exports only the route-facing surface:

```ts
export { IssueDetailPanel } from './view'
```

Internal types (`IssuePanelState`, `DetailApplicationService`, `DetailLoadError`, …) are not part of the public surface and are not re-exported.

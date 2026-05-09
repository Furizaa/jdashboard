# Detail

Renders a single Jira issue in a side panel. Owns the panel's open/close state, ADF rendering, sibling navigation within a column, keyboard shortcuts (J/K/↑/↓/O/C/Esc), the Activity feed, Relationships (parent / sub-issues / linked issues), and the properties rail.

## Language

**IssuePanelState**:
The discriminated union the view-model derives from query data: `closed | loading | error | ready`. `ready` carries the `DetailIssue`, computed `jiraUrl`, sibling navigation keys, and bound action callbacks (`close`, `open`, `openInJira`, `copyJiraLink`).

**DetailIssue** (kernel re-export):
The full issue payload returned by the gateway. Carries description (ADF), comments, links, parent, sub-issues, plus the same fields as `BoardIssue`.

**Sibling**:
Another issue in the same column (per `columnForStatus`) of the current board. The `prevKey`/`nextKey` pair drives J/K navigation and the panel header arrows.

**Shortcut action**:
A keyboard event resolved through `shouldHandleShortcut` and the J/K/↑/↓/O/C ladder in the presenter. The presenter applies the resulting effect (`navigate`, `openInBrowser`, `copyJiraLinkAndToast`) directly.

_Avoid_: "DetailState" (overloaded — the public surface is `IssuePanelState`), "panel" by itself (it's the view node, not the union).

## Use-cases (application service surface)

The `DetailApplicationService` exposes a small port-mediated surface. The presenter today reads cached data through coordinator hooks (`useTicket`, `useBoardData`); the application service exists for parity with Board and is the seam through which slice 6 will route the cache port.

| Method           | Returns                                        | Notes                                                                                                 |
| ---------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `loadIssue(key)` | `ResultAsync<DetailSnapshot, DetailLoadError>` | Wraps the gateway. `DetailLoadError` is `DetailUnauthorized \| DetailNotFound \| DetailNetworkError`. |
| `refresh(key)`   | `void`                                         | Invalidates the cached issue via the cache port.                                                      |

`DetailLoadError` is three hand-rolled tagged classes (`_tag: 'DetailUnauthorized' \| 'DetailNotFound' \| 'DetailNetworkError'`) per ADR 0004; the consumer unwraps via `result.match` or ts-pattern over the underlying tagged union.

## View-model state machine

Detail's view-model is derivation-only — there is no internal state to fold. The public function is `derive(input) → IssuePanelState`. `input` carries the `issueKey`, a flat view of the issue query (`data | isPending | isError | error`), the current board issues (for sibling derivation), and three injected effects (`navigate`, `openInBrowser`, `copyJiraLinkAndToast`).

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
- `~/features/status-pill`, `~/features/ticket-card`, `~/features/mr-status` — widgets imported from their _current_ `features/` locations until slice 56 moves them under `~/widgets/`.

No imports from `~/contexts/<other>`. Cross-context coordination would go through the coordinator.

## Public surface

`src/contexts/detail/index.ts` exports only the route-facing surface:

```ts
export { IssueDetailPanel } from './view'
```

Internal types (`IssuePanelState`, `DetailApplicationService`, `DetailLoadError`, …) are not part of the public surface and are not re-exported.

# clashboard — Linear-style personal Jira board

## Problem Statement

The team's Jira Kanban board does not match how I think about my work. The board's "In Progress" column lumps together three distinct phases — `In Implementation`, `In Code Review`, and `In STG` — making it impossible to see at a glance what is actively being coded vs. what is awaiting review vs. what has shipped to staging. Conversely, `In QA` and `In UAT` each get their own column despite, from my perspective, both representing work that is effectively out of my hands. The result is a board where the columns I look at most (active work) are over-collapsed, and the columns I look at least (verification stages) are over-expanded.

I cannot change the team's Jira board configuration. I want a personal view of the same tickets that reflects the columns I care about, without leaving the Jira ecosystem (since the team still operates there). On top of the column structure, the Jira UI itself is sluggish and visually noisy; I want something that reads as well as Linear.

## Solution

A small local web app — clashboard — that renders my Jira tickets as a Kanban board with my preferred column structure:

- **TO DO** ← `Reviewed`, `Blocked`
- **In Implementation** ← `In Implementation`
- **In Code Review** ← `In Code Review`
- **Done** ← `In STG`, `In QA`, `In UAT`, `Done`

The app is read-mostly. It fetches data from the Jira REST API on a 1-minute polling interval and via a manual refresh button. The only mutation is changing a ticket's status, performed via a dropdown on the ticket's status pill. The dropdown only offers transitions Jira allows from the ticket's current status.

Tickets can be opened in a floating "hover modal" side panel showing description, comments, sub-issues, linked issues, and properties. The visual design follows Linear's aesthetic — dark theme, rich typography, colored type icons, hashed-color label dots.

The app runs locally; authentication is via a Jira Cloud API token stored in a `.env` file. Deployment is out of scope.

## User Stories

1. As a developer, I want to see all my Frontend tickets in project HDR on a single board view, so that I do not have to context-switch between Jira filters to track my work.
2. As a developer, I want my board to use four columns — TO DO, In Implementation, In Code Review, Done — so that the column layout matches how I actually think about my work.
3. As a developer, I want each card to display its fine-grained Jira status as a colored pill, so that I can tell whether a card in the "Done" column is in STG, QA, UAT, or actually Done.
4. As a developer, I want every card to show its key, title, type, and labels, so that I can identify it without opening a detail view.
5. As a developer, I want a colored type icon (Epic, Task, Story, Bug, Improvement, Spike) on each card, so that I can scan the board for bugs, epics, etc. without reading text.
6. As a developer, I want labels rendered as colored dots with deterministic colors per label string, so that I can recognize a label across cards by its color.
7. As a developer, I want the global filter label (e.g. `Frontend`) hidden from cards because it is on every card, so that the cards are not visually noisy.
8. As a developer, I want clicking a card's key to copy the ticket's Jira URL to my clipboard with a confirmation toast, so that I can paste it into chat or PR descriptions quickly.
9. As a developer, I want Cmd/Ctrl-clicking a card's key to open the ticket in Jira in a new tab, so that I have an escape hatch to the full Jira UI.
10. As a developer, I want clicking anywhere on a card body (other than the key or pill) to open a detail panel for that ticket, so that I can read its description without leaving the app.
11. As a developer, I want clicking a card's status pill to open a dropdown of valid Jira transitions, so that I can change the status without dragging or leaving the board.
12. As a developer, I want the status dropdown to fetch fresh transitions from Jira when it opens, so that the menu reflects the ticket's current allowed transitions even if the board polled stale data moments ago.
13. As a developer, I want my chosen status change to apply optimistically with the card updating immediately, so that the app feels instantaneous.
14. As a developer, I want a failed transition to roll back the card and surface Jira's error in a toast, so that I understand why the change was rejected.
15. As a developer, I want the app to refetch the just-changed ticket after a successful transition, so that any post-transition side-effects Jira applied (auto-labels, auto-assignment) appear in my view.
16. As a developer, I want the board to refresh automatically every minute, so that I see changes my teammates make without manual action.
17. As a developer, I want polling to pause when my browser tab is hidden, so that I do not waste Jira API rate-limit budget on tabs I am not looking at.
18. As a developer, I want the app to refetch immediately when I return focus to the tab, so that I see fresh data the moment I look at the app.
19. As a developer, I want a "Synced Ns ago" indicator visible in the header, so that I can tell at a glance how stale my data is.
20. As a developer, I want a manual refresh button next to the sync indicator, so that I can force a refresh when I know something has changed.
21. As a developer, I want cards whose status changed during a poll to briefly pulse, so that my eye is drawn to what changed without me having to compare manually.
22. As a developer, I want new and removed cards to fade in and out, so that the board layout does not jump abruptly during polls.
23. As a developer, I want to open a ticket detail view as a floating side panel from the right, so that the board stays visible behind it for context.
24. As a developer, I want the detail panel's URL to include the ticket key as a search parameter, so that I can share a link to a specific ticket and bookmark it.
25. As a developer, I want browser back to close the detail panel, so that navigation feels native.
26. As a developer, I want Esc to close the detail panel, so that I can dismiss it quickly without reaching for the mouse.
27. As a developer, I want prev/next arrows in the detail panel header, so that I can step through tickets in a column without returning to the board.
28. As a developer, I want J/K and arrow keys to navigate between tickets in the panel, so that keyboard-only navigation is fast.
29. As a developer, I want the detail panel to render the ticket's ADF description natively in the app's design language, so that it looks consistent with the rest of the board.
30. As a developer, I want the detail panel to show comments chronologically with author and timestamp, so that I have full context on the ticket without leaving the app.
31. As a developer, I want a "Parent" section in the detail panel, so that I can navigate to the parent ticket or epic.
32. As a developer, I want a "Sub-issues" section with a progress chip (n done / m total), so that I can see how a parent's children are progressing.
33. As a developer, I want a "Linked issues" section grouped by link type (Blocks, Is blocked by, Relates to, etc.), so that I can understand a ticket's dependencies at a glance.
34. As a developer, I want clicking a sub-issue or linked-issue row to navigate the panel to that issue, so that I can traverse a graph of related work.
35. As a developer, I want sub-issues and linked issues to load even if they fall outside my JQL filter, so that I never see an empty link because the linked ticket is in another project or label.
36. As a developer, I want a properties rail in the detail panel showing status, labels, type, assignee, reporter, and priority, so that I can see metadata without scanning the ADF.
37. As a developer, I want the status pill in the properties rail to be clickable with the same dropdown as cards, so that I can change status from the detail view too.
38. As a developer, I want an "Open in Jira" link in the detail panel header, so that I have an escape hatch to the full Jira UI for anything the app cannot render.
39. As a developer, I want unsupported ADF nodes to render as a small `[unsupported: type]` placeholder, so that I notice when content is missing without the renderer crashing.
40. As a developer, I want `O` to open the current ticket in Jira and `C` to copy its URL when the panel is open, so that I do not need to mouse to those actions.
41. As a developer, I want to type into a search box in the header to filter cards by key or title, so that I can narrow the board when it has many tickets.
42. As a developer, I want Cmd/Ctrl+K to focus the search input, so that I can begin searching without reaching for the mouse.
43. As a developer, I want Esc to clear the search, so that I can return to the full board quickly.
44. As a developer, I want the app to use a dark theme, so that it matches my IDE and reduces glare during long debugging sessions.
45. As a developer, I want a header showing the app name, current scope (project · label), search input, refresh button, sync indicator, and my Jira avatar, so that I always know what I am looking at and who I am authenticated as.
46. As a developer, I want skeleton cards on initial load, so that the board's structure is visible immediately even before data arrives.
47. As a developer, I want a clear "No tickets match" message when the JQL returns nothing, so that I understand it is a configuration issue, not an app bug.
48. As a developer, I want a full-screen "Invalid Jira credentials" message if the API returns 401, with a link to Atlassian's API token page, so that I can fix `.env` quickly.
49. As a developer, I want a non-blocking error banner during transient 5xx errors, with the last good data still visible, so that I can keep working while Jira recovers.
50. As a developer, I want the Jira API token to live exclusively on the server, so that it never leaks to my browser bundle, network logs, or DevTools.
51. As a developer, I want the project key, label, and Done-window all configurable via `.env`, so that I can adjust the scope without code changes.
52. As a developer, I want the app's JQL to use Jira's `currentUser()` so that the token's owner determines whose tickets appear, so that swapping tokens does not require code changes.
53. As a developer, I want Done-status tickets older than the configured window to drop off the board automatically, so that the rightmost column does not grow without bound.
54. As a developer, I want Epics included on the board if they are assigned to me, so that I can manage my Epics in the same view as my tickets.
55. As a developer, I want the app's package versions to be the latest at the time of build, so that I am not locked to outdated dependencies on day one.
56. As a developer, I want the app to fail loudly at server boot if any required `.env` variable is missing, so that misconfiguration is caught immediately rather than producing confusing runtime errors.
57. As a developer, I want a feature-folder source layout, so that adding a new feature later (e.g. a saved-filter dropdown) is a localized change.
58. As a developer, I want CORS handled by my own server proxy rather than the browser hitting Jira directly, so that I do not depend on Atlassian whitelisting my origin.
59. As a developer, I want my Jira user avatar resolved from `/myself` and shown in the header, so that I have visual confirmation I am authenticated as the right person.

## Implementation Decisions

### Stack

- **Language:** TypeScript.
- **UI:** React, Tailwind v4 (CSS-first `@theme` config), shadcn/ui primitives.
- **Routing & full-stack runtime:** TanStack Start (with TanStack Router file-based routes and TanStack Query for client cache).
- **Tooling:** oxlint for linting, oxfmt for formatting (with Prettier as fallback if oxfmt is not yet production-ready), Vitest for tests.
- **Additional libraries:** `sonner` (toasts), `lucide-react` (icons), `date-fns` (relative time), `clsx` + `tailwind-merge` (the shadcn `cn` helper).
- Package versions to be checked against the npm registry at the time of project scaffolding — this is a hard requirement, not a guideline.

### Architecture

- All Jira API calls go through TanStack Start server functions. The Jira API token never reaches the browser.
- HTTP Basic auth: `email:api_token` base64-encoded into the `Authorization` header.
- TanStack Query on the client; query functions call the server functions exposed by the framework.
- Vertical / feature-folder source layout: `routes/`, `features/{board, ticket-card, ticket-detail, status-pill, app-shell}`, `server/jira/`, `lib/`, `components/ui/`, `styles/`. Each feature exposes its public surface via a barrel `index.ts`. Tests are colocated with sources.
- Cross-feature imports go through barrels; no deep imports into another feature's internals.

### Data scope (single JQL query)

```
project = HDR
  AND assignee = currentUser()
  AND labels = "<JIRA_LABEL_FILTER>"
  AND (statusCategory != Done OR status changed to Done after -<JIRA_DONE_WINDOW_DAYS>d)
ORDER BY rank
```

- Project, label, and Done window are environment variables.
- Epics included; no `issuetype` exclusion.

### Status ↔ column mapping

- Single source of truth in a domain-logic module. Maps Jira statuses to columns and vice versa.
- `TO DO` ← `Reviewed`, `Blocked`.
- `In Implementation` ← `In Implementation`.
- `In Code Review` ← `In Code Review`.
- `Done` ← `In STG`, `In QA`, `In UAT`, `Done`.
- Cards show fine-grained status (the real Jira status) as a colored pill regardless of which column they live in.

### Status changes (only mutation)

- Triggered by clicking the status pill on a card or in the detail panel's properties rail.
- Dropdown lazily fetches valid transitions from `/issue/{key}/transitions` when opened, so the menu always reflects current Jira-allowed transitions.
- Optimistic update: card updates immediately on click. On Jira error, card rolls back and a `sonner` toast surfaces Jira's error message.
- On success, the single issue is refetched (not the full board) to capture transition side-effects.
- No drag-and-drop. No keyboard shortcut for status changes (avoid accidental moves).

### Polling

- 1-minute interval for the board issue list.
- Polling pauses when `document.visibilityState === 'hidden'`; resumes and refetches immediately on focus.
- When the detail panel is open, the open issue is also polled at 1 minute.
- Manual refresh button refetches the board list and invalidates all individual issue caches.
- Header shows a "Synced Ns ago" indicator that updates every ~5s; clicking it triggers a refresh; on poll error it switches to a red `Sync failed · Retry` state with the underlying error in a tooltip.
- Cards whose status (or other displayed fields) changed during a poll get a 600ms pulse; new cards fade in; removed cards fade out.

### Card

- Three-row layout: type icon + key + clickable status pill (right); title (2-line clamp); label dots row.
- Type icon implemented with `lucide-react` plus a couple of custom SVGs as needed (Epic/Task/Story/Bug/Improvement/Spike).
- No assignee avatar.
- Click on key copies the Jira URL with a brief in-place "Copied" indicator; Cmd/Ctrl-click opens the URL in a new tab; rest of card opens the detail panel.
- Labels rendered as deterministic-color dots; up to 3 visible with a `+N` chip beyond. A configured set of labels (e.g. the global filter label) is hidden by default.
- Subtle hover state: border lift, no full background change.

### Detail panel

- Floating "hover modal" side panel from the right (rounded corners, gap from edges, drop shadow, soft backdrop).
- URL-driven: `?issue=<KEY>` search param. Closing the panel removes the param. Browser back/forward cycle works naturally.
- Header: breadcrumb, prev/next arrows (column-scoped), close, "Open in Jira".
- Body sections in order: title, ADF description, Parent, Sub-issues (with `n/m` progress chip), Linked issues (grouped by link type), Activity feed (read-only comments).
- Right-side properties rail: clickable status pill, labels, type, assignee, reporter, priority.
- Linked-issue and sub-issue rows render compact: type icon, key, title, non-clickable status pill. Clicking a row replaces the panel content with that issue (URL updates).
- Sub-issues and linked issues fetched on demand even if outside the board JQL filter.

### ADF renderer

- Custom recursive renderer. Public interface: a `<RenderAdf doc={...} />` component.
- Supported nodes: `doc`, `paragraph`, `heading` (h1–h6), `text` with marks (`strong`, `em`, `code`, `link`, `strike`), `bulletList`, `orderedList`, `listItem`, `codeBlock`, `blockquote`, `hardBreak`, `rule`, `mention`, `emoji`, `mediaSingle` / `mediaGroup` (image), `status`, `panel`.
- Mentions render their `attrs.text` directly (no separate user lookup).
- Unsupported nodes degrade to a faint `[unsupported: <type>]` placeholder.
- Tickets in this team are typically prose-heavy (headings + paragraphs), so polishing those node types takes priority.

### Authentication

- Env vars: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`, `JIRA_LABEL_FILTER`, `JIRA_DONE_WINDOW_DAYS`.
- Validated at server boot. A missing or empty value fails loud with a console error pointing to `.env.example`.
- 401 response surfaces a full-screen "Invalid Jira credentials" message with a link to Atlassian's API token page.
- The "connected apps" / OAuth flow is out of scope.

### App shell

- No sidebar. ~48px top header.
- Left: small wordmark + scope breadcrumb (e.g. `HDR · Frontend`).
- Right: search input, refresh button, sync indicator, Jira user avatar (resolved from `/myself`).
- Dark theme only.

### Filtering / sorting

- Single client-side search input; `Cmd+K` focuses, `Esc` clears. Filters by ticket key or title (case-insensitive).
- No issue-type filter, sort picker, or group-by control.
- Default order: Jira `rank`.

### Keyboard shortcuts

- `Cmd/Ctrl+K`: focus search.
- `Esc`: close detail panel or clear search.
- `J` / `↓`: next ticket in column (panel open).
- `K` / `↑`: previous ticket in column (panel open).
- `O`: open current ticket in Jira (panel open).
- `C`: copy URL of current ticket (panel open).

### Loading / empty / error states

- **Initial board load:** skeleton cards in each column (animated shimmer).
- **Empty column:** small grey "No tickets" placeholder.
- **Empty board:** full-screen message naming the env vars to check.
- **401:** full-screen "Invalid Jira credentials" message with link to Atlassian's API token page.
- **Transient 5xx / network:** non-blocking error banner with retry; last good data remains visible.
- **Transition error:** `sonner` toast with Jira's error message.

### Modules

The codebase is organized so the testable behavior lives in pure (or thinly wrapped) modules, and React components stay as composition layers on top.

- **Jira API client** (server): fetch wrapper with auth header, error mapping (401 / 5xx / network), JSON parsing, retry policy. Public interface is a small set of methods (`searchIssues`, `getIssue`, `getTransitions`, `transitionIssue`, `getMyself`). All server functions in `server/jira/` build on this client.
- **JQL builder** (server): pure function from a config object (`projectKey`, `label`, `doneWindowDays`) to a JQL string.
- **Status mapping** (domain): pure module exposing `columnForStatus(status)`, `statusesForColumn(column)`, and the canonical column ordering. Sole source of truth for the column ↔ status invariant.
- **Transition resolver** (domain): pure function `(currentStatus, targetColumn, allowedTransitions) → Transition | null`. Encapsulates the cascade logic (e.g. dragging a `Reviewed` card to "Done" tries `In STG` first, etc.) — kept around even though drag is descoped, because the same logic governs status-pill flows that cross column boundaries.
- **Search filter** (domain): pure function `(issues, query) → issues`. Matches against key and title, case-insensitive.
- **Hash color** (UI helper): deterministic mapping from a label string to a color in a fixed palette.
- **ADF renderer** (UI): recursive `<RenderAdf doc={...} />` component with per-node sub-components. Public surface stable; internal node-handling can change freely.
- **Polling hook** (React infra): visibility-aware interval. Wraps TanStack Query's `refetchInterval` with a `document.visibilityState`-driven pause/resume.
- **TanStack Query hooks**: `useBoardIssues`, `useIssue`, `useTransitions`, `useTransitionMutation`. Thin wrappers around the server functions with appropriate query keys and invalidation rules.
- **UI features** (`board`, `ticket-card`, `status-pill`, `ticket-detail`, `app-shell`): composition over the deep modules above. Most logic flows through the modules; components handle rendering and event wiring.

## Testing Decisions

### What makes a good test

- Tests assert external behavior — a module's input/output contract — not its internal structure. They survive refactors.
- Tests cover business rules and edge cases, not framework integration.
- Pure-function modules are tested directly with input/output. Time-dependent or DOM-dependent modules use Vitest fake timers and JSDOM.
- React components that are mostly composition are validated by manually opening the running app, not unit tests, unless they encapsulate non-trivial logic.

### Modules to test (Vitest)

- **Status mapping** — round-trip every Jira status to its column; every column lists the expected statuses; ordering is stable.
- **Transition resolver** — table-driven cases: from each starting status, dragging to each column, given an allowed-transitions list, expect the chosen transition (or `null` for "no valid path"). Edge cases: single-status column, no valid path, current status already in the target column.
- **JQL builder** — input config (project, label, Done window) → expected JQL string, including variants where the label contains a space (must be quoted) and where the Done window is at the boundary (0, large).
- **Search filter** — exact key match, partial title match, case insensitivity, empty query (returns all), multi-word queries, queries with leading/trailing whitespace.
- **Hash color** — same label always produces same color; different labels are spread across the palette (statistical sanity check).
- **ADF renderer** — snapshot tests per supported node type, plus a few real-world fixtures combining multiple node types. The unsupported-node fallback path is asserted explicitly.
- **Polling hook** — pauses on `document.hidden`, refetches on focus, cleans up on unmount. Uses Vitest fake timers and a mocked `visibilityState`.

### Prior art

- This is a new project with no in-repo prior art. The Vitest patterns will be standard:
  - Pure-function tests using `expect(fn(input)).toEqual(expected)`.
  - Snapshot tests for the ADF renderer using Vitest's built-in snapshot support.
  - A small JSDOM-based test for the polling hook using `@testing-library/react`'s `renderHook`.

## Out of Scope

- Deployment. The app runs locally only.
- The Atlassian "connected apps" / OAuth flow. Authentication is via `.env`-stored API token only.
- Any mutation other than status changes (commenting, editing description, creating/removing links, changing assignee, editing labels, changing priority).
- Drag-and-drop. Status changes are dropdown-only.
- A light theme.
- A sidebar / multiple views. The app has one view.
- Issue-type filtering, sorting controls, and group-by. Search-only.
- A standalone full-page ticket route (Linear's `issue.png` style). Detail is panel-only.
- Component-level tests for primarily-presentational UI. Manual verification against the running app substitutes.
- Showing branch / PR refs from Jira's "Development" panel.
- Multi-project support. Single project (configurable).
- Multi-label support. Single label (configurable).
- Atlaskit's renderer or any prosemirror-based ADF library — a custom minimal renderer is used.
- Real-time updates beyond 1-minute polling. No WebSockets, no Atlassian webhooks.
- Notifications (browser notifications, sound, badge counts).
- Mobile / responsive layout. Desktop only.

## Further Notes

- The aesthetic target is Linear. Inspiration screenshots live in `.agents/inspiration/`. The closer the result is to Linear visually, the better; later iterations can drift toward the project's own identity.
- Success means the app feels instant: optimistic status updates, paused polling on hidden tabs, a custom ADF renderer with no Atlaskit overhead.
- The vertical / feature-folder layout exists specifically to make later additions cheap. Examples of features that could come later (out of scope here): a saved-filters sidebar, a "recently changed" inbox view, mobile-responsive layout, light theme, comment editing, multi-project support.
- Package versions must be verified against the npm registry at scaffolding time. This is non-negotiable per the user's spec.

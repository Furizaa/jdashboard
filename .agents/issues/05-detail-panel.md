# 05 — Detail panel (read-only, plain text)

**Type:** AFK

## Parent

[clashboard PRD](../prds/clashboard.md)

## What to build

Open a floating "hover modal" side panel for a ticket. Description rendered as plain text for now (ADF renderer comes in slice 06).

- **`getIssue(key)` server function**: fetches a single issue with description, fields, comments, links, sub-issues, parent. (Fields needed for downstream slices can be requested now to avoid schema churn.)
- **`useIssue(key)` query hook**.
- **URL-driven panel state**: `?issue=<KEY>` search param via TanStack Router. Setting it opens the panel for that key; removing it closes the panel.
- **Card body click** opens the panel (sets the search param). Click on key / pill / labels does not.
- **Panel layout**: floating overlay from the right (rounded corners, gap from edges of the viewport, drop shadow, soft backdrop covering the board behind). Width ~480px on wide viewports.
- **Panel header**: breadcrumb (`<PROJECT_KEY> · <KEY>`), close button, prev/next arrows (stepping through tickets in the same column — wrap or stop at ends; pick one and document), "Open in Jira" external link.
- **Panel body** (this slice):
  - Title (large)
  - Description rendered as **plain text** — extract text content from the ADF tree as a placeholder (e.g. concatenate `text` node values). The ADF renderer comes in 06.
- **Properties rail** (right side of panel body): display-only status pill, labels (hashed colors), type, assignee (display name), reporter (display name), priority.
- **Esc** closes the panel.
- **Browser back** closes the panel (search param removed via router navigation).
- **Loading state** in the panel body while the issue is fetching (skeleton).

## Acceptance criteria

- [ ] Clicking a card body opens the panel; URL updates to `?issue=<KEY>`.
- [ ] Panel renders as a floating overlay (rounded corners, gap from edges, shadow, soft backdrop). Board still visible behind.
- [ ] Esc closes the panel and clears the search param.
- [ ] Browser back closes the panel.
- [ ] Header shows breadcrumb, close, prev/next arrows, and "Open in Jira" link.
- [ ] Prev/next navigates within the current column (behavior at column ends documented).
- [ ] Title rendered prominently.
- [ ] Description rendered as plain text (placeholder; ADF renderer is slice 06).
- [ ] Properties rail shows status (display-only pill), labels, type, assignee, reporter, priority.
- [ ] Loading skeleton shown while issue detail is fetching.
- [ ] Click on key / status pill / label dot inside the card does not open the panel.

## Blocked by

- [03 — Card visual polish](./03-card-polish.md)

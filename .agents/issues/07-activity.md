# 07 — Comments / activity feed

**Type:** AFK

## Parent

[clashboard PRD](../prds/clashboard.md)

## What to build

Add the activity feed to the detail panel. Read-only.

- Comments are part of the issue payload fetched in slice 05 (or fetched alongside via the issue's comments endpoint — pick whichever Jira API call is cleaner).
- **Activity section** in the panel body (below sub-issues / linked issues, which arrive in slice 08).
- Each comment row:
  - Author avatar
  - Author display name
  - Relative timestamp (e.g. "3 days ago" via `date-fns` `formatDistanceToNow`)
  - Comment body rendered through `<RenderAdf>` (slice 06)
- Comments ordered chronologically (oldest first).
- Empty state: small grey "No activity" placeholder.
- Compose box NOT included — read-only.

## Acceptance criteria

- [ ] Activity section displays all comments for the issue.
- [ ] Each comment shows author avatar, display name, relative timestamp, and ADF-rendered body.
- [ ] Comments ordered oldest-first (chronological).
- [ ] Empty state shown when an issue has no comments.
- [ ] No compose box / no edit affordances.
- [ ] Comments within an issue update when the issue is refetched (lays groundwork for polling).

## Blocked by

- [06 — ADF renderer (core nodes)](./06-adf-core.md)

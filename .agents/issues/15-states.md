# 15 — Loading / empty / transient-error states

**Type:** AFK

## Parent

[clashboard PRD](../prds/clashboard.md)

## What to build

Polish the remaining state surfaces. (401 was handled in slice 01; transition errors in slice 10; sync-failed in slice 11.)

- **Initial load skeleton** — 3–5 skeleton cards per column with a subtle shimmer animation while the first board fetch resolves.
- **Empty board state** — when the configured JQL returns zero results, show a full-screen message naming the relevant env vars (`JIRA_PROJECT_KEY`, `JIRA_LABEL_FILTER`) and suggesting they may need adjustment. Polite tone — this is normal when filters are tight.
- **Transient 5xx / network errors** — non-blocking error banner at the top of the board area: "Couldn't reach Jira. Retrying in 30s. [Retry now]". Last good board data remains visible behind the banner. Banner dismisses automatically when the next successful poll completes.
- **No layout shift** between skeleton state and real content — column layout stable across the transition.

## Acceptance criteria

- [ ] Initial load shows 3–5 skeleton cards per column with shimmer.
- [ ] Skeletons are replaced by real cards once data arrives without column-width or row-height jumps.
- [ ] Empty board (zero results from JQL) shows a full-screen message naming `JIRA_PROJECT_KEY` and `JIRA_LABEL_FILTER`.
- [ ] On 5xx / network error during a poll, a non-blocking banner appears at the top with a "Retry now" action; last good data remains visible.
- [ ] The banner clears automatically when the next successful poll completes.
- [ ] No layout shift between skeleton and real content.

## Blocked by

- [02 — Read-only board with status mapping](./02-board-statuses.md)

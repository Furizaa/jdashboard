# 19 — Merged warning + In STG transition

**Type:** AFK

## Parent

[GitLab MR status PRD](../prds/gitlab-mr-status.md)

## What to build

The fourth and final Code Review warning — and the only one that mutates Jira state. A single click on the warning transitions the ticket to "In STG" using the existing transition mutation infrastructure from issue 10.

- Extend `src/features/mr-status/MrSection.tsx` to handle summarizer `kind === 'merged'` for Code Review:
  - Render `<MrWarning>` with text: "MR is merged — move ticket to In STG".
  - Body click invokes the transition action described below.
  - "View MR ↗" link on the right opens the MR's `web_url` in a new tab without triggering the transition (verify `event.stopPropagation()` on the link).
- Transition action implementation:
  - On click, fetch the ticket's transitions using the existing `getTransitions` server function (or the existing TanStack Query hook around it).
  - Look for a transition whose `to.name === 'In STG'`.
  - If found: invoke the existing transition mutation (issue 10) with that transition's id, applying the same optimistic update + toast-on-error semantics as the status pill.
  - If not found: surface a `sonner` toast — "No direct transition to In STG. Move `<ticketKey>` in Jira." — and do not mutate. No auto-cascade through intermediate states.
- The target status name lives as a single constant `MERGED_TARGET_STATUS = 'In STG'` in the gitlab feature module.
- Verification is manual per the PRD.

## Acceptance criteria

- [ ] Code Review card whose matching MR is in `state === 'merged'` shows the "MR is merged" amber warning row.
- [ ] Clicking the warning body looks up transitions for the ticket, finds the one whose `to.name === 'In STG'`, and invokes the existing transition mutation with that id. The card's status pill updates optimistically — same UX as the existing status pill.
- [ ] If "In STG" is not a directly-allowed transition from the ticket's current Jira status, a toast surfaces the limitation and the ticket does not move.
- [ ] On Jira rejection of the transition, the optimistic update rolls back and Jira's error message surfaces in a toast (reuses the existing pattern from issue 10).
- [ ] Clicking the "View MR ↗" link opens the MR `web_url` in a new tab and does not trigger the transition.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

- [18 — Warning rows: draft, no-MR, no-reviewers](./18-warning-rows.md)

# 20 — Done lane desync warning

**Type:** AFK

## Parent

[GitLab MR status PRD](../prds/gitlab-mr-status.md)

## What to build

Render the MR section on Done-column cards, but only for the desync case (open MR while ticket is in Done). All other Done states are silent.

- Update `src/features/board/Board.tsx` and `src/features/ticket-card/TicketCard.tsx` so that `<MrSection>` is also rendered when `column === 'Done'` (it currently only renders for Code Review per slice 17).
- Extend `src/features/mr-status/MrSection.tsx` to add a Done-column branch:
  - If a matching MR exists with `state === 'opened'` (regardless of draft status, regardless of reviewer state — anything not yet merged): render an amber warning row "Ticket is Done — MR still open". Body click opens the MR's `web_url` in a new tab.
  - If the matching MR is `merged`, or there is no matching MR at all: render `null`. No section, no divider, no skeleton.
- The Done branch should not show the loading skeleton at all — Done cards have no MR section visible by default, so jumping a skeleton in only to disappear when data resolves would be visually noisy. Render nothing while loading, then conditionally render the warning if the desync condition holds.
- Verification is manual per the PRD.

## Acceptance criteria

- [ ] Done card whose matching MR is in `state === 'opened'` (any sub-state) shows the amber "Ticket is Done — MR still open" warning row.
- [ ] Clicking the warning opens the MR's `web_url` in a new tab.
- [ ] Done card whose matching MR is `merged` renders no section.
- [ ] Done card with no matching MR renders no section.
- [ ] Done cards never show a loading skeleton — they stay quiet until the desync condition is detected.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

- [18 — Warning rows: draft, no-MR, no-reviewers](./18-warning-rows.md)

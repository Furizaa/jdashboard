# 42 — Detail panel "Open MR" extension to review-mode tickets

**Type:** AFK

## Parent

[GitLab MR review cards PRD](../prds/gitlab-mr-review-cards.md)

## What to build

A small extension to the existing `OpenMrLink` in the detail panel header so the MR is one click away for review-mode tickets too — not just for tickets I authored an MR on.

- Today, `OpenMrLink` in `src/features/ticket-detail/IssueDetailPanel.tsx` reads from `useMrFor(issueKey)` (author-mode statuses keyed by Jira ticket key). When the panel is opened for a Jira ticket I am only reviewing (assigned as reviewer on someone else's MR for that ticket), the author-mode lookup returns nothing and the link is hidden.
- Extend `OpenMrLink` so it also consults the review-card cache:
  - Read `useReviewCards()`. If any review card has a `kind: 'review-real'` entry whose embedded Jira `key === issueKey`, use that card's `webUrl` for the link.
  - Precedence when both lookups yield a result: prefer the author-mode `useMrFor` result (the MR I authored is more relevant than an MR I'm only reviewing on the same ticket — although in practice the two lookups are unlikely to both fire on the same key).
  - If neither yields a result, render `null` (current behaviour).
- The link's visible label stays `Open MR` in both cases. Nothing in the panel distinguishes "an MR I authored" from "an MR I'm reviewing"; that distinction is already on the board card.
- Fake review cards have no detail panel (per slice 40), so this extension does not need to handle the fake-card case — `OpenMrLink` is only ever rendered for tickets with a Jira key.
- No new tests at the unit level — `OpenMrLink` is composition over the two existing data hooks. Manually verify by opening the detail panel from a review-mode card whose underlying Jira ticket is not assigned to me; the `Open MR` link should appear with the correct destination.

## Acceptance criteria

- [ ] When the detail panel is opened from a real review-mode card whose underlying Jira ticket has no author-mode MR (because it's not assigned to me), the panel header shows an `Open MR` link pointing to the review-MR's `webUrl`.
- [ ] When the detail panel is opened from a Jira-work card whose ticket has an author-mode MR, the panel header shows an `Open MR` link pointing to the author-MR's `webUrl` (current behaviour, unchanged).
- [ ] If both author-mode and review-mode lookups happen to match the same ticket key, the author-mode MR wins and is shown.
- [ ] When the detail panel is opened from a Jira ticket with no associated MR in either cache, the `Open MR` link is hidden.
- [ ] The link's visible label is `Open MR` in all cases — the panel does not distinguish "my MR" from "an MR I'm reviewing".
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

- [38 — Review-mode cards end-to-end (spine)](./38-review-cards-spine.md)

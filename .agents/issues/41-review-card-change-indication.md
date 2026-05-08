# 41 — Review-card change-indication animations

**Type:** AFK

## Parent

[GitLab MR review cards PRD](../prds/gitlab-mr-review-cards.md)

## What to build

Generalize the existing `use-change-indication` hook so review cards animate enter / leave / changed transitions on poll boundaries the same way Jira cards do today.

- Generalize `src/features/board/use-change-indication.ts`:
  - The current implementation keys the leaving / entering / changed sets by `BoardIssue.key`. Generalize it to accept an arbitrary id-keyed list, taking an `id(item) → string` selector and an `equals(prev, next) → boolean` (or `hash(item) → string`) predicate for detecting "changed".
  - Existing call sites pass `id = (issue) => issue.key` and a predicate that checks `statusName` (current behaviour). The change is API-shape only — call-site behaviour is unchanged.
  - Two return value categories ("entering keys", "changed keys", "leaving items") remain unchanged in shape.
- Wire review cards through the generalized hook:
  - In `use-board-view.ts` (or wherever `assemble-columns` is invoked), feed `useReviewCards()`'s array into a parallel call of the change-indication hook, keyed by MR `iid` (string-coerced).
  - The "changed" predicate compares review-state bucket between polls; transitions like `Needs Review → Review Rejected` (you commented and requested changes) or `Needs Review → Review Accepted` (you approved or the MR merged) trigger the pulse.
  - The "entering" set captures newly-assigned reviews on a fresh poll.
  - The "leaving" set captures MRs that disappeared from the poll (closed, removed-as-reviewer, or fell out of the `updated_after` window).
- `assemble-columns` already handles the `entering | changed | leaving | idle` animation states via the existing helper. Pass the review-card change indication results through the same channel so the splice logic produces the correct `state` flag per `ColumnItem` for review cards too.
- The `TicketCardAnimationState` type and the `data-animation` attribute on the rendered card require no changes — the existing CSS animations are reused.
- For "leaving" review cards, the card persists in its original lane for one render cycle with the fade-out animation, then is removed. Mirror the existing leaving-issue carry-through.
- Tests (Vitest):
  - Extend `use-change-indication.test.ts` with cases covering:
    - Generic id selector (not just `issue.key`) — assert the hook works for any keyed list.
    - Mixed concurrent calls — two parallel invocations (Jira issues, review cards) maintain independent state.
    - "Changed" predicate fires on a custom field (not just status) — exercises the generalized predicate path.
- Composition layers (the parallel `use-change-indication` call in the board-view layer, the splice in `assemble-columns`) are manually verified.

## Acceptance criteria

- [ ] A new review card (e.g. an MR I was just added as a reviewer to) fades in on the next poll with the same animation Jira cards use.
- [ ] A removed review card (MR closed, I was removed as reviewer, or it fell out of the lookback window) fades out on the next poll with the same animation Jira cards use.
- [ ] A review card whose review-state bucket changed between polls (e.g. Needs Review → Review Accepted on merge, Needs Review → Review Rejected when I push the request-changes button) briefly pulses with the existing `changed` animation.
- [ ] Animations on Jira-work cards are unchanged in behaviour — the generalization is API-shape only.
- [ ] Two independent change-indication tracks (Jira issues + review cards) coexist without cross-contamination — a Jira-card change does not pulse a review card and vice versa.
- [ ] `use-change-indication.test.ts` covers the generalized id selector and changed-predicate paths.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

- [38 — Review-mode cards end-to-end (spine)](./38-review-cards-spine.md)

# 49 — E2e: review-cards folder specs

**Type:** AFK

## Parent

[E2e harness PRD](../prds/e2e-harness.md)

## What to build

Four scenario specs covering the review-cards feature folder. Reuses the GitLab World + factories introduced in slice 48; extends them with reviewer-mode list shape and the bulk Jira fetch.

- Extend `World`:
  - `listMrsByReviewer(username)` — for the reviewer-mode list call. Returns MRs from `seedMrs` filtered to those where the GitLab current user appears in the reviewer list (per `seedMrReviewers`).
  - `bulkLoadIssues(keys)` — serves the JQL `key in (...)` request the review-card pipeline issues. Reads from the same World as `searchIssues`.
- Extend MSW handlers: `GET /api/v4/projects/:id/merge_requests?reviewer_username=…&state[]=opened&state[]=merged&updated_after=…`. Confirm the existing search endpoint accepts the new bulk-fetch JQL shape; if a separate handler is cleaner, add one.

Specs:

- `tests/e2e/review-cards/lane-placement.spec.ts` — seed three review MRs covering each review-state bucket (Needs Review / Review Rejected / Review Accepted); assert each card renders in the expected lane (TO DO / TO DO de-emphasized / Done) at the expected sort position relative to existing Jira cards. Assert the `READY TO PICK` rename is in effect on a Jira card with status `Reviewed`.
- `tests/e2e/review-cards/fake-card.spec.ts` — seed a review MR whose title contains a Jira key not present in the bulk-fetch result (deleted/cross-project); seed a separate review MR whose title contains no Jira key; assert each renders as a fake card with the `MR !<iid>` key, GitMerge icon, MR title as summary, and no labels/epic. Click the body of a fake card, assert it opens the MR URL in a new tab. Click the key of a fake card, assert the same.
- `tests/e2e/review-cards/pill-non-interactive.spec.ts` — seed an open review MR; assert the status pill renders the review-state name (Needs Review / Review Rejected / Review Accepted); click the pill; assert no dropdown appears and no transition request fires. The pill must be non-interactive on review cards.
- `tests/e2e/review-cards/lazy-load.spec.ts` — render the board; assert no GitLab review-card request fires before the Jira board has resolved (verify via MSW request log timestamps); after the board resolves, assert the review-card request fires; advance clock 60s, assert the review-card stream re-polls; dispatch hidden, advance 120s, assert no re-poll; dispatch visible, assert immediate re-poll. Reuses the visibility/polling primitives from slice 44.
- Extend `src/lib/testids.ts` only as needed: `reviewCard` (or a discriminator on `ticketCard`), `fakeReviewCard` marker, `reviewPill` (or rely on the existing `statusPill` testid plus a non-interactive role assertion).
- No source-under-test changes beyond testid additions.

## Acceptance criteria

- [ ] All four specs pass on a clean checkout.
- [ ] Lane-placement spec asserts the full sort tier order around each lane (`Needs Review` → `READY TO PICK` → `Review Rejected` → `Blocked` in TO DO; `... → Done → Review Accepted` in Done).
- [ ] Fake-card spec covers both fallback paths (missing key, no key) in one spec; no real Jira-detail panel opens for either.
- [ ] Pill-non-interactive spec asserts both the rendered review-state text *and* the click-does-nothing behaviour — the second is the more important assertion.
- [ ] Lazy-load spec proves the gating order via MSW request log timestamps; flake-resistant via `page.clock` rather than wall-clock waits.
- [ ] No structural CSS selectors. Testids added centrally.
- [ ] `pnpm typecheck` and `pnpm lint` pass.

## Blocked by

- 48 — E2e MR-status folder (introduces GitLab World + factories)

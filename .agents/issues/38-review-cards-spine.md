# 38 — Review-mode cards end-to-end (spine)

**Type:** AFK

## Parent

[GitLab MR review cards PRD](../prds/gitlab-mr-review-cards.md)

## What to build

The spine of the feature: the full happy-path slice that takes raw GitLab API data, enriches it with bulk Jira metadata, and produces review-mode cards on the board for MRs where the current user is assigned as a reviewer (and the MR title contains a resolvable Jira project key).

- Extend `src/server/gitlab/gateway.ts`:
  - `ListMrsQuery` accepts either `authorUsername` or `reviewerUsername` (xor — exactly one is required). Other fields unchanged.
  - New method `getMrReviewers(iid)` returning `GitlabResult<RawMrReviewerWithState[]>`. The new raw type carries `username`, `displayName`, `avatarUrl`, and `state ∈ {'unreviewed' | 'review_started' | 'reviewed' | 'requested_changes' | 'approved'}`.
- Extend `src/server/gitlab/http-gateway.ts`:
  - `listMrs` builds the query string with `reviewer_username = <user>` when `reviewerUsername` is set, otherwise `author_username = <user>` (current behaviour). The pagination, `state[]`, `updated_after`, `order_by`, `sort` parameters are unchanged.
  - New `getMrReviewers(iid)` calling `/api/v4/projects/<encoded path>/merge_requests/<iid>/reviewers`. Wire-shape mapping mirrors the existing reviewer mapping but additionally carries the top-level `state` field on each entry.
- Extend `src/server/jira/issue-service.ts` with a new method `bulkLoadIssues(keys: string[])`:
  - Returns `{ ok: true; baseUrl: string; found: BoardIssue[]; missing: string[] } | { ok: false; reason: 'unauthorized' }`.
  - JQL: `key in (<comma-separated keys>)` with the same field projection currently used by `loadBoard`. Empty input short-circuits to an empty result without hitting the API.
  - The `missing` array reports keys that were requested but not returned by Jira (deleted, cross-project, permission-denied).
- New pure module `src/features/mr-status/review-state.ts`:
  - Public function `reviewBucket(myReviewerState, mrState)` returning `'needs-review' | 'rejected' | 'accepted' | 'drop'` per the PRD table:
    - `mrState === 'closed'` → `'drop'`
    - `mrState === 'merged'` → `'accepted'` (regardless of reviewer state)
    - `mrState === 'opened'`, reviewer state `'requested_changes'` → `'rejected'`
    - `mrState === 'opened'`, reviewer state `'approved'` → `'accepted'`
    - `mrState === 'opened'`, reviewer state `'unreviewed' | 'review_started' | 'reviewed'` → `'needs-review'`
- New module `src/server/gitlab/review-service.ts`:
  - Public function `createGitlabReviewService(gitlabGateway, jiraService, config)` returning `{ getReviewCards(): Promise<GetReviewCardsResult> }`.
  - Pipeline:
    1. Resolve current GitLab user (cached for the process — share the cache with `mr-service`).
    2. `listMrs({ states: ['opened', 'merged'], reviewerUsername, updatedAfter })` with the same `JIRA_DONE_WINDOW_DAYS` window already used elsewhere.
    3. Drop drafts (`mr.draft === true`).
    4. For each remaining MR, fan out four parallel calls: `getMr(iid)`, `getMrDiscussions(iid)`, `getMrApprovals(iid)`, `getMrReviewers(iid)`.
    5. From the `/reviewers` response find the entry matching the current user; pass `(myState, mrState)` to `reviewBucket`. Drop MRs returning `'drop'`.
    6. Reuse the existing `summarizeMr` primitives for the per-card reviewer visual states, CI state, and unresolved-thread count. Wire the per-reviewer `approval_status` from the new `/reviewers` payload (preferred) into `reviewerVisualState` so the previously-unreachable `requested_changes` red-solid branch lights up.
    7. Extract the first matched Jira key from each MR title using the same regex as `mr-key-map.ts` (`\b{projectKey}-\d+\b`).
    8. Bulk-fetch the deduped key set via `bulkLoadIssues`.
    9. Compose `ReviewCard[]`, each carrying: MR identity (`iid`, `webUrl`, `title`), bucket (`'needs-review' | 'rejected' | 'accepted'`), MR state (`'opened' | 'merged'`), reviewer visual states + CI state + unresolved count, and either embedded Jira fields (`key`, `summary`, `typeName`, `labels`, `epic`) or `{ jira: null }` for the not-found / no-key case.
  - Returns `{ ok: true; baseUrl: string; cards: ReviewCard[] } | { ok: false; reason: 'unauthorized' }`. Any single GitLab call returning `unauthorized` short-circuits the whole result; non-401 GitLab failures and Jira-side failures bubble as throws so the hook layer can silently degrade.
- New server function `getReviewCards` in `src/server/gitlab/server-functions.ts`. Lazy singleton mirroring the existing `getMrStatuses` wiring.
- Extend `src/dashboard/`:
  - `tanstack-cache.ts` adds a query key `reviewCards` and a stale-time entry.
  - `cache.ts` (`DashboardCache` port) adds `invalidateReviewCards()`. The `tanstack-cache.ts` adapter implements it.
  - `service.ts`'s `refreshAll` calls `cache.invalidateReviewCards()` alongside the existing invalidations.
  - `hooks.ts` adds `useReviewCards()` — same lazy-gating pattern as `useMrStatuses` (`enabled: jiraReady`), same `usePolling` cadence, same `notifyUnauthorizedOnce('gitlab')` wiring on a 401 result. The dedupe set in `service.ts` is shared with `useMrStatuses` so a single GitLab outage triggers at most one toast.
  - Add a slice helper `useReviewCardFor(iid)` only if the composer needs it; otherwise the composer reads the full array.
- Extend `src/features/status-pill/status-color.ts`:
  - Add three new entries keyed by review-state names. Suggested palette: `needs review` → eye-catching cyan/violet (`#22d3ee` / `#a78bfa` family), `review rejected` → signal red (`#ef4444`), `review accepted` → restrained green (`#10b981`). Final hex values may be tuned visually.
  - The pill keys for review-state values are matched case-insensitively, consistent with existing behaviour.
- Extend `src/features/status-pill/StatusIcon.tsx` with three new shapes:
  - `review-needs`: outline circle with `stroke-dasharray`.
  - `review-rejected`: outline circle with `stroke-dasharray` (same shape, different color via `currentColor`).
  - `review-accepted`: solid (continuous) outline circle.
  - All three use `r=6`, `strokeWidth=1.5`, matching the existing `'todo'` shape's geometry; the dash pattern is the only differentiator from `'todo'`.
- Extend `src/features/status-pill/StatusPill.tsx` (or its select wrapper):
  - Accept a `clickable: boolean` flag. When `false`, render an inert variant (a `<span>` styled like the pill but without the dropdown wiring). Keyboard focus is dropped.
- Extend `src/features/mr-status/MrSection.tsx`:
  - Accept an additional input shape for review-mode cards. Routing:
    - Review-mode + open MR (any bucket): render the existing reviewer-avatar row + CI/conflict indicator + unresolved-thread chip. The chip rule is unchanged (threads not started by the current user).
    - Review-mode + merged MR (always `accepted`): render nothing.
  - The four author-mode warning rows (no-MR, draft, no-reviewers, merged-desync) are author-only and never fire for review-mode cards.
- Define a new `ReviewCard` type in a shared location (likely `src/server/gitlab/review-service.ts` or `src/features/mr-status/`). The type is a discriminated union on `kind: 'review-real' | 'review-fake'` — but in this slice, only `'review-real'` is constructed (resolvable Jira key). The fake path is wired in slice 40.
- Extend `src/features/board/assemble-columns.ts`:
  - Accept a `reviewCards: ReviewCard[]` input alongside the existing Jira-issue input.
  - For each review card, place it in TO DO (buckets `needs-review` and `rejected`) or Done (bucket `accepted`) based on the review-state bucket, regardless of the underlying Jira ticket's actual status.
  - Sort tier ordering within each lane is **not** finalized in this slice. The new tier order (Needs Review > READY TO PICK > Review Rejected > Blocked; Done ending with Review Accepted) is wired in slice 39. In this slice, review cards may interleave with Jira cards in their lane in a not-fully-correct order — this is acceptable because slice 39 lands shortly after.
- Extend `src/features/board/use-board-view.ts` to subscribe to `useReviewCards()` and pass the result through to `assembleColumns`.
- Extend `src/features/ticket-card/TicketCard.tsx`:
  - Accept a discriminated union: `card: { kind: 'jira'; issue: BoardIssue } | { kind: 'review-real'; card: ReviewCardReal }` (the `'review-fake'` branch is added in slice 40).
  - For `kind: 'jira'`: existing render unchanged.
  - For `kind: 'review-real'`:
    - Type icon resolves from the embedded Jira fields (same as Jira cards).
    - Key text: the embedded Jira key. Click semantics: copy Jira URL / Cmd-click → open Jira.
    - Status pill: text = review-state name (`'Needs Review' | 'Review Rejected' | 'Review Accepted'`); `clickable = false`.
    - Summary, labels row, epic chip: from embedded Jira fields.
    - `MrSection` receives the review-mode input.
    - Body click opens the existing detail panel (`?issue=<KEY>`).
    - Deemphasis is the existing rule for now (slice 39 generalizes).
- Tests (Vitest), colocated:
  - `review-state.test.ts`:
    - All `(myReviewerState, mrState)` combinations including `closed`-drop, `merged`-accepted regardless of reviewer state, `opened` × each of the 5 reviewer states.
  - `review-service.test.ts`:
    - Gateway-injected, asserts: drop closed-not-merged, drop draft, fan-out per MR, mapping of `/reviewers` `state` into bucket, composition of `cards` array with embedded Jira metadata for resolvable keys, `missing` keys leave a `jira: null` placeholder (real shape exercised here even though TicketCard rendering of fake cards lands in slice 40).
    - 401 from any of the four per-MR calls bubbles up as `{ ok: false; reason: 'unauthorized' }`.
    - Empty list → empty `cards` (no Jira call).
  - `bulk-load-issues.test.ts` (or fold into existing service tests):
    - JQL string assembly with one key, many keys, special characters quoted correctly.
    - Empty input short-circuits to `{ found: [], missing: [] }` with no API call.
    - Partial result splits into `found`/`missing` correctly.
- Composition layers (`MrSection` review branch, `TicketCard` discriminator branch, `assemble-columns` splice, `useReviewCards` hook, `getReviewCards` server fn) are manually verified per the PRD's testing decisions.

## Acceptance criteria

- [ ] Every GitLab MR where I am assigned as a reviewer, with `state ∈ {opened, merged}`, not draft, and whose title contains a Jira project key resolvable in Jira, surfaces as a card on the board.
- [ ] Cards whose underlying GitLab reviewer state is `unreviewed`, `review_started`, or `reviewed` on an open MR render in TO DO with a `Needs Review` pill (eye-catching color, dashed StatusIcon).
- [ ] Cards whose reviewer state is `requested_changes` on an open MR render in TO DO with a `Review Rejected` pill (signal red, dashed StatusIcon).
- [ ] Cards whose reviewer state is `approved` on an open MR, OR whose MR is merged regardless of reviewer state, render in Done with a `Review Accepted` pill (green, solid StatusIcon).
- [ ] Closed-not-merged MRs do not surface as cards.
- [ ] Draft MRs do not surface as cards.
- [ ] The pill on review cards is visually rendered but non-interactive (no transitions dropdown opens on click).
- [ ] Open-MR review cards (all three buckets) show a horizontal divider followed by the reviewer-avatar row + CI/conflict indicator + unresolved-thread chip. Self avatar is included.
- [ ] The reviewer-avatar row's per-reviewer rings are correct, including the `requested_changes` solid-red ring (now reachable via the `/reviewers` payload).
- [ ] Merged-MR review cards (all `Review Accepted`, Done lane) render no section under the card.
- [ ] No author-mode warning rows (no-MR / draft / no-reviewers / merged-desync) fire on any review card.
- [ ] A Jira ticket assigned to me AND referenced in someone else's MR I'm reviewing surfaces as two distinct cards on the board (additive model).
- [ ] Real-card body click opens the existing Jira detail panel for the underlying ticket. Key click copies the Jira URL; Cmd/Ctrl-click on the key opens Jira in a new tab.
- [ ] Review-card data lazy-loads after the Jira board has resolved at least once. No skeleton placeholder appears during the load — a one-time layout jump on first load is acceptable.
- [ ] Review-card polling runs on the existing 60-second cadence, pauses when the tab is hidden, and refetches immediately on focus.
- [ ] The manual refresh button invalidates the review-cards cache alongside the Jira board and author-mode MR statuses.
- [ ] A GitLab 401 anywhere in the review pipeline surfaces the existing one-time GitLab-auth toast, and the dedupe set is shared with the author-mode MR-statuses pipeline (a single 401 produces at most one toast across both).
- [ ] Any other GitLab failure (5xx, network) inside the review pipeline silently degrades to no review cards; the rest of the board keeps working.
- [ ] A Jira bulk-fetch failure silently degrades the review-card stream; the board (already loaded) is unaffected.
- [ ] `review-state` and `review-service` are unit-tested per the PRD's testing decisions; `bulkLoadIssues` JQL assembly is unit-tested.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

Out of scope for this slice (scheduled for the listed follow-ups): fake cards (40), sort tier finalization within lanes (39), Review Rejected de-emphasis (39), `READY TO PICK` display rename (39), change-indication animations (41), detail-panel "Open MR" extension to review-mode tickets (42).

## Blocked by

None — extends existing GitLab and Jira modules.

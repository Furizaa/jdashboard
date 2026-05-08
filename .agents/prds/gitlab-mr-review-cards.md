# clashboard — review-mode cards for GitLab MRs assigned to me as reviewer

## Problem Statement

The board surfaces work I own (Jira tickets assigned to me) and the state of MRs I authored on those tickets, but it tells me nothing about MRs other people have assigned to me as a reviewer. Today, finding out what I owe a review on means leaving the board, going to GitLab, scanning the "Review requested" view, switching back, and mentally interleaving "code reviews I owe" with "tickets I should pick up next". The cost of that context-switch is high enough that I either let reviews pile up (slowing teammates) or constantly tab away (which fragments my own work).

The existing GitLab MR row solves the *author-side* of this — for tickets I own, I can see who's reviewed my MR and whether CI is green. The reviewer-side is the missing half. Without it, the board claims to be "one view of what I have to work on" but quietly excludes a category of work I owe — and code reviews are *higher* priority than starting the next ticket, so the omission is exactly backwards.

## Solution

Surface every GitLab MR where I am assigned as a reviewer (and the MR is not a draft) as a card on the board, alongside my Jira-work cards. The Jira ticket referenced in the MR title (matched by the existing `JIRA_PROJECT_KEY` regex) provides the card's identity and metadata; if the title has no key, or the key doesn't resolve in Jira, the card falls back to an MR-only "fake" rendering that is still actionable.

Each review card lives in TO DO or Done depending on my own review state on its MR — overriding whatever lane the underlying Jira ticket would otherwise sit in:

- **Needs Review** (my reviewer state is `unreviewed`, `review_started`, or `reviewed` on an open MR) — top of TO DO, dashed StatusIcon, eye-catching pill color. The loudest signal on the board.
- **Review Rejected** (my reviewer state is `requested_changes` on an open MR) — TO DO, below `READY TO PICK`, de-emphasized like `Blocked` (the work is on the author now), dashed signal-red StatusIcon.
- **Review Accepted** (my reviewer state is `approved` on an open MR, *or* the MR is merged) — bottom of Done, solid green StatusIcon. Settled.

To eliminate vocabulary collision, the existing Jira `Reviewed` status — which used to be the unambiguous "next ticket to pick up" — is renamed in the UI to `READY TO PICK`. The underlying Jira string stays `Reviewed` for transitions and JQL.

Review cards reuse the existing reviewer-avatar row + CI/conflict indicator + unresolved-thread chip from author-mode under their own divider. The four author-mode warning rows (no-MR / draft / no-reviewers / merged-desync) do not fire on review cards — they describe inconsistencies that are the assignee's job to fix, not the reviewer's. Merged MRs render no section under the card; silence is the right answer when the system is consistent.

GitLab data continues to lazy-load after the Jira board paints; the same 60-second polling cadence, hidden-tab pause, and one-time-401-toast semantics apply. The bulk Jira metadata fetch for review-card tickets is a single JQL `key in (...)` request piggybacked onto the review-card pipeline.

## User Stories

1. As a developer, I want every GitLab MR where I am assigned as a reviewer (and not in draft) to surface a card on the board, so that I have one view of work I owe regardless of whether the underlying Jira ticket is mine.
2. As a developer, I want review cards to be additive — coexisting with my Jira-work cards, even when both happen to reference the same Jira key — so that no information is lost when I both own a ticket and separately review someone else's MR for it.
3. As a developer, I want the unit of a review card to be the MR (not the Jira key), so that two MRs referencing the same ticket appear as two distinct cards I can act on independently.
4. As a developer, I want closed-not-merged MRs dropped from the review stream, so that abandoned reviews do not clutter the board.
5. As a developer, I want merged MRs I previously reviewed to remain on the board as Review Accepted in the Done lane, so that recently-completed reviews stay in view alongside my own shipped work.
6. As a developer, I want an MR where my review state is `unreviewed`, `review_started`, or `reviewed` to render as **Needs Review**, so that any open verdict I owe is surfaced as the loudest signal in the TO DO lane.
7. As a developer, I want an MR where I have requested changes (`requested_changes`) to render as **Review Rejected**, so that I can tell apart MRs awaiting my verdict from MRs where my verdict is already in but waiting on the author.
8. As a developer, I want an MR where I have approved on an open MR — or any merged MR — to render as **Review Accepted**, so that I can see reviews I have already completed.
9. As a developer, I want a re-requested review (GitLab resets my state to `unreviewed`) to flip back to Needs Review automatically on the next poll, so that I do not need to track which approvals were invalidated by new commits.
10. As a developer, I want **Needs Review** cards to sort above `READY TO PICK` in the TO DO lane, so that pending reviews always render above the next ticket I would pick up.
11. As a developer, I want **Review Rejected** cards to render in the TO DO lane below `READY TO PICK` with reduced opacity (matching the `Blocked` treatment), so that they remain visible without pulling focus from work I should pick up next.
12. As a developer, I want **Review Accepted** cards to render at the bottom of the Done lane, so that completed reviews stay in the verification pipeline view but never dominate it.
13. As a developer, I want the existing sort tiers (`Reviewed`/`Blocked` in TO DO; `In STG`/`In QA`/`In UAT`/`Done` in Done) to remain unchanged, so that the rest of the board's behavior is preserved.
14. As a developer, I want the Jira `Reviewed` status to display as **READY TO PICK** everywhere it appears (status pill, sort labels), so that I do not confuse it with the new review-state vocabulary.
15. As a developer, I want the rename to be display-only — the underlying Jira string stays `Reviewed` for transitions and JQL — so that no Jira-side configuration changes.
16. As a developer, I want the status pill on review-mode cards to show the review-state name (Needs Review / Review Rejected / Review Accepted) in place of the underlying Jira status, so that the most important signal for that card is also the most prominent.
17. As a developer, I want the status pill on review-mode cards to be non-interactive (no transitions dropdown), so that I do not accidentally try to transition a ticket I am not the assignee of.
18. As a developer, I want the StatusIcon next to the pill to be a dashed circle for Needs Review and Review Rejected, so that "still owed" and "contested" share a visual language of "ring open".
19. As a developer, I want the StatusIcon next to the pill to be a solid circle for Review Accepted, so that "settled" cards read distinct from cards that still need work.
20. As a developer, I want each review-state pill to use a distinct color palette (eye-catching for Needs Review, signal red for Review Rejected, restrained green for Review Accepted), so that scanning the lanes is fast.
21. As a developer, I want every open-MR review card to show the existing reviewer-avatar row, so that I can see who else is on the hook before I start my review.
22. As a developer, I want my own avatar included in that reviewer row, so that the row is not silently missing a reviewer (which would read as a bug rather than an editorial choice).
23. As a developer, I want every open-MR review card to show the existing CI/conflict indicator, so that I can see whether the build is green before deciding to start the review.
24. As a developer, I want every open-MR review card to show the existing unresolved-thread chip, so that I have a quantitative sense of how much pending discussion remains.
25. As a developer, I want merged-MR review cards (Review Accepted in Done) to render nothing under the divider, so that completed work is rewarded with silence.
26. As a developer, I want the four author-mode warning rows (no-MR / draft / no-reviewers / merged-desync) suppressed on review cards, so that the board does not show me consistency warnings that are not my responsibility to fix.
27. As a developer, I want Jira metadata for all review-card tickets (summary, type icon, labels, epic) loaded via a single bulk Jira fetch keyed by all review-MR title keys, so that one extra request enriches every review card.
28. As a developer, I want a review card whose MR title contains a Jira key not resolvable in Jira (deleted, cross-project, permission-denied) to fall back to a fake-card rendering, so that a missing key never silently disappears the review.
29. As a developer, I want a review card whose MR title contains no Jira key at all to render as a fake card, so that bare-MR reviews are still surfaced on the board.
30. As a developer, I want a fake review card to display its key as `MR !<iid>` (matching GitLab's `!` convention), so that the identifier reads as a merge-request rather than a Jira ticket.
31. As a developer, I want a fake review card to use a `GitMerge` icon in place of the Jira type icon, so that the card is recognizable as an MR-only artifact at a glance.
32. As a developer, I want a fake review card to use the MR title (verbatim) as its summary, so that the card remains readable without Jira backing.
33. As a developer, I want a fake review card to render no labels row and no epic chip, so that only fields with real data are shown.
34. As a developer, I want a fake review card to share the rest of the card chrome (pill, MR section, layout) with real cards, so that the board does not feel inconsistent.
35. As a developer, I want a real review card whose MR title contains multiple Jira keys to use the first matched key for display and Jira lookup, so that one card per MR is preserved without throwing away the MR.
36. As a developer, I want a real review card body click to open the existing Jira-detail panel for the underlying ticket, so that I can read the ticket description before reviewing.
37. As a developer, I want a real review card key click to copy the Jira URL (and Cmd/Ctrl-click to open it in a new tab), so that the existing key-click vocabulary is preserved.
38. As a developer, I want a fake review card body click to open the MR directly in a new tab, so that the only artifact I can act on is one click away.
39. As a developer, I want a fake review card key (`MR !<iid>`) click to also open the MR in a new tab, so that there is no asymmetry between body-click and key-click on a Jira-less card.
40. As a developer, I want the detail-panel header to grow an "Open MR" link whenever the open ticket has any associated MR (author-mode *or* review-mode), so that the MR is always one click away from the detail view — including for tickets I own with my own MR.
41. As a developer, I want the "Open MR" link to use the same destination semantics regardless of role, so that one rule covers both my MRs and MRs I am reviewing.
42. As a developer, I want fake review cards to have no detail panel, so that an empty Jira-detail experience is never offered.
43. As a developer, I want the detail panel for a real review card to be otherwise unchanged from a regular Jira-card panel, so that "review-ness" stays a board-level concept and the panel stays focused on Jira data.
44. As a developer, I want review-card data to lazy-load after the Jira board has resolved at least once, so that initial board paint is never blocked by GitLab + bulk-Jira.
45. As a developer, I want no skeleton row or layout placeholder during the review-card load, so that I accept a small one-time layout jump instead of paying skeleton complexity.
46. As a developer, I want review-card polling to share the existing 60-second cadence, paused on hidden tabs and refetched on focus, so that the board's freshness model stays a single concept.
47. As a developer, I want the manual refresh button to invalidate the Jira board, the author-mode MR statuses, and the review-card stream together, so that "give me everything fresh" is one click.
48. As a developer, I want a GitLab 401 anywhere in the review-card pipeline to surface the existing one-time GitLab-auth toast (shared dedupe set with the author-mode MR statuses), so that auth misconfiguration is loud once and silent thereafter.
49. As a developer, I want any other GitLab failure (5xx / network) in the review-card pipeline to silently degrade to no review cards, so that a flaky GitLab never breaks my Jira board.
50. As a developer, I want a Jira bulk-fetch failure to silently degrade the review-card stream, so that the rest of the board (which has already loaded) is unaffected.
51. As a developer, I want partial Jira misses (some keys found, some missing) to fall through to fake-card rendering for the missing keys only, so that one missing key does not blank out the whole batch.
52. As a developer, I want a new review card (e.g. an MR I was just assigned) to fade in on the next poll, so that it announces itself the same way Jira cards do.
53. As a developer, I want a review card whose state changed between polls (e.g. Needs Review → Review Accepted on merge) to briefly pulse, so that my eye is drawn to the change.
54. As a developer, I want a removed review card (closed MR, or removed-as-reviewer) to fade out on the next poll, so that the board layout does not jump abruptly.

## Implementation Decisions

### Behavioral model

- Additive stream: review cards co-exist with Jira-work cards. Same Jira key may appear twice — once as my-work, once as my-review. This is intentional. No de-duplication, no "merge into one card" logic.
- The Jira `Reviewed` status displays as `READY TO PICK` everywhere it appears. Display-only — underlying string unchanged for transitions and JQL.
- Review cards' lane and sort priority are determined by **review state**, not by the underlying Jira status of the referenced ticket.

### Discovery and data scope

- GitLab list query: `reviewer_username = me`, `state[] = opened|merged`, `updated_after = now − JIRA_DONE_WINDOW_DAYS days`, with the same project-scoped path the existing list uses. Closed-not-merged MRs are not requested.
- Drafts are filtered out: an MR with `draft = true` is dropped from the review stream regardless of state.
- Card unit = MR (deduped by `iid`). MR titles with multiple Jira keys use the first match for display and Jira lookup; other keys are ignored for the card.
- Jira metadata for the discovered keys is fetched via a single JQL `key in (...)` query (the bulk fetch). The set of unique keys to look up is deduped before the fetch; cards stay 1:1 with MRs.
- A key that the bulk fetch returns no result for falls through to fake-card rendering. So does an MR with no key in its title.

### Status mapping (review state precedence)

The new pure module reduces (`my-reviewer-state`, `mr-state`) to one of three buckets, plus `drop`:

| Signal | Bucket |
| --- | --- |
| `mr.state = closed` | drop |
| `mr.state = merged` | **Review Accepted** |
| `mr.state = opened`, my reviewer state = `requested_changes` | **Review Rejected** |
| `mr.state = opened`, my reviewer state = `approved` | **Review Accepted** |
| `mr.state = opened`, my reviewer state = `unreviewed` / `review_started` / `reviewed` | **Needs Review** |

The `reviewed`-as-Needs-Review case intentionally treats commenting without a verdict as "still on the hook". `review_started` is treated identically.

### Pill and StatusIcon

- New pill text values: `Needs Review`, `Review Rejected`, `Review Accepted` — added to the same status-color module that owns the existing Jira-status palette.
- Pill on review cards is non-interactive (renders as a span / inert button, no transitions dropdown wiring).
- Three new `StatusIcon` shapes: `review-needs` (dashed circle), `review-rejected` (dashed circle), `review-accepted` (solid circle). Color is encoded via `currentColor` as with existing shapes.
- Pill colors: an eye-catching cyan/violet for Needs Review (deliberately distinct from any existing Jira-status color so it pops), signal red for Review Rejected, restrained green for Review Accepted.

### Sort and lane placement

The `sort-column` module is extended; tier orders become:

- **TO DO**: `Needs Review` → `READY TO PICK` (formerly `Reviewed`) → `Review Rejected` → `Blocked`.
- **Done**: `In STG` → `In QA` → `In UAT` → `Done` → `Review Accepted`.

The `deemphasize` module is generalized from a hardcoded "TO DO and not Reviewed" check into a `(lane, status) → boolean` lookup, with `Review Rejected` joining `Blocked` in the TO DO de-emphasized tier. Done has no de-emphasis.

### MR section on review cards

`MrSection` is extended to know about review-mode. Routing rules:

- Open MR (Needs Review / Review Rejected / Review Accepted-but-not-merged): render the existing reviewer-avatar row + CI/conflict indicator + unresolved-thread chip. Self avatar is included.
- Merged MR (always Review Accepted): render nothing under the divider.
- The four author-mode warning rows (no-MR / draft / no-reviewers / merged-desync) are author-only branches and never fire for review-mode cards.
- Unresolved-thread counter rule is unchanged: count threads `resolvable = true`, `resolved = false`, first-note author ≠ current user. The role (author vs reviewer) does not change the rule.

### Card view-model and TicketCard

A new pure module owns the per-card view-model: it takes either a `BoardIssue` (Jira-mode) or a `ReviewCard` (review-mode) and emits a unified `TicketCardViewModel` covering: key text + click action, pill text + clickable flag, type icon kind, body click target, MR-section input, de-emphasized flag, fake-flag.

`TicketCard` becomes a presentational shell that consumes the view-model with no source-aware branching. Sub-components (`CardKey`, `EpicChip`) remain private. No compound-components refactor — composition is identical between Jira-work cards and review cards; only the slot contents differ. A future card kind that genuinely diverges in layout is the right time for compound; today's two card kinds do not.

### Detail panel

- Panel header gains an "Open MR" link whenever the open ticket has *any* associated MR — author-mode (looked up via the existing `useMrFor`) or review-mode (looked up via the new review-card cache). One unified rule.
- The panel itself renders unchanged for review-mode tickets: no review-state banner, no special properties-rail entry. Review-state is a board-level concept; once the panel is open, it is Jira territory.
- Fake review cards have no panel; their body and key clicks open the MR directly in a new tab.

### GitLab API: sourcing reviewer state

The standard `GET /merge_requests/:iid` REST endpoint **does not** carry per-reviewer interaction state (verified against GitLab 18.4 docs). The dedicated `GET /projects/:id/merge_requests/:merge_request_iid/reviewers` endpoint returns each reviewer with a `state` field (`unreviewed` / `review_started` / `reviewed` / `requested_changes` / `approved`).

A new gateway method `getMrReviewers(iid)` fetches this endpoint per MR. The per-MR fan-out grows from three parallel calls (detail + discussions + approvals) to four (+ reviewers). Latency is unchanged — all four are concurrent.

The new endpoint is the canonical source for the new review-mode pipeline. The author-mode pipeline (`getMrApprovals` + discussion-note inference) remains unchanged for now — retiring it and re-routing author-mode through `/reviewers` is a separate cleanup with its own diff and risk profile, deferred deliberately.

### Server-side data flow

A new server function `getReviewCards()` owns the review-card pipeline end-to-end:

1. Resolve current GitLab user (cached for the process).
2. List MRs with `reviewer_username = me`, `state[] = opened|merged`, `updated_after = now − doneWindow`. Drop drafts.
3. For each MR, fan out in parallel: `getMr` (detail), `getMrDiscussions`, `getMrApprovals`, **`getMrReviewers`**.
4. For each MR, derive my reviewer state from the `/reviewers` response, run the new review-state mapping, and (if not dropped) compose a `ReviewCard` with the per-MR summary fields (reviewers, CI state, unresolved count) — reusing the existing `summarizeMr` primitives.
5. Collect the unique Jira keys from review-MR titles; bulk-fetch them via a single JQL `key in (...)` query (a new Jira service method `bulkLoadIssues`).
6. For each MR, look up its first-key Jira metadata in the bulk result; missing keys produce a `fake: true` flag on the `ReviewCard`.
7. Return `{ ok: true, cards: ReviewCard[] }` or `{ ok: false, reason: 'unauthorized' }`.

The discriminated union for `ReviewCard` carries: MR identity (`iid`, `webUrl`, `title`), review state bucket, the existing per-reviewer visual state list + CI state + unresolved count, and either embedded Jira fields (`key`, `summary`, `typeName`, `labels`, `epic`) or a `fake` marker.

### Client-side: hook, cache, composer

- New TanStack Query hook `useReviewCards()`. Same lazy-gating pattern as `useMrStatuses` (gated on Jira board ready). Same `usePolling` cadence (60 seconds, hidden-tab-aware). Same retry policy.
- The dashboard cache port (`DashboardCache`) gains `invalidateReviewCards()`. The `refreshAll` action invalidates board + author-MR statuses + review cards together.
- The composer in `assemble-columns` is extended: after Jira issues are placed into lanes, the review-card array is spliced in. Each review card lands in TO DO or Done based on its `reviewState` bucket; sort tiers handle ordering.
- `use-change-indication` is generalized to accept an id-keyed list. Review cards are tracked by MR `iid` (matching the "card unit = MR" decision); transitions between review-state buckets between polls trigger the `changed` pulse, new MRs trigger `entering`, dropped MRs trigger `leaving`.
- The 401-toast dedupe set in the dashboard service is shared between author-mode and review-mode GitLab paths.

### Gateway changes

- `ListMrsQuery` accepts either `authorUsername` or `reviewerUsername` (xor) — extended from the current author-only shape.
- New raw type `RawMrReviewerWithState = { username, displayName, avatarUrl, state }` and gateway method `getMrReviewers(iid)`.
- Existing types and methods otherwise unchanged.

### Errors

- GitLab 401 in any call inside the review-card pipeline returns `{ ok: false, reason: 'unauthorized' }` from `getReviewCards()`, which the hook translates into the existing one-time `notifyUnauthorizedOnce('gitlab')` toast (deduped with author-mode).
- GitLab 5xx / network: the review-card stream renders nothing. No toast. The board is unaffected.
- Jira bulk-fetch failure: the review-card stream renders nothing. No toast. The board (already loaded) is unaffected.
- Jira partial misses: the keys with no result fall through to fake-card rendering for those cards only.

## Testing Decisions

### What makes a good test

Same principle as the parent PRDs: tests assert a module's input/output contract, not its internal structure. Pure-function modules are tested directly with input/output. React components that are mostly composition (TicketCard, MrSection, ReviewerAvatar, MrWarning) are validated by manually opening the running app, not unit tests. New modules that encapsulate a real decision get tests; thin glue does not.

### Modules to test (Vitest)

- **Review-state mapping** — table-driven: every combination of (`my-reviewer-state` ∈ {unreviewed, review_started, reviewed, requested_changes, approved}) × (`mr-state` ∈ {opened, merged, closed}) → expected bucket (Needs Review / Review Rejected / Review Accepted / drop). Includes the "merged regardless of my state → Accepted" precedence and the "closed → drop" precedence.
- **Card view-model** — table-driven over inputs (`BoardIssue` only, real `ReviewCard` with embedded Jira, fake `ReviewCard` without Jira) → expected view-model. Covers: key text + click action, pill text + clickable flag, type icon kind, body click target, MR-section input shape, de-emphasized flag.
- **Bulk Jira loader** — JQL string assembly: empty input (must not produce a malformed query), single key, many keys, key with hyphenated project prefix. Includes the field projection matching `loadBoard`.
- **Generalized `deemphasize`** — table-driven: every (lane, status) combination including the new `Review Rejected` entry, the unchanged `Blocked` entry, and "no de-emphasis" for Done.
- **Extended `sort-column`** — table-driven for the new TO DO tier order (`Needs Review` → `READY TO PICK` → `Review Rejected` → `Blocked`) and the new Done tier order ending in `Review Accepted`. Stable secondary order preserved.
- **`assemble-columns` review-card splice** — given a board snapshot + a `ReviewCard[]`, assert each card lands in the expected lane with the expected tier position and that Jira-card placement is unaffected.

### Modules not tested at the unit level

- The new GitLab gateway method `getMrReviewers` (thin fetch wrapper; matches the existing decision to not unit-test fetch wrappers).
- The new server function `getReviewCards` (orchestration). The pieces it composes are individually tested.
- The `useReviewCards` TanStack Query hook (configuration only).
- React components: the new branches inside `MrSection`, the `TicketCard` view-model consumption layer, and the panel-header "Open MR" affordance. Manually verified by opening the running app against a real GitLab + Jira.

### Prior art

- `features/board/status-mapping.test.ts`, `features/board/sort-column` patterns, `features/board/deemphasize.test.ts` — pure-function table-driven tests are the dominant style in this repo.
- `features/mr-status/reviewer-state.test.ts`, `features/mr-status/ci-state.test.ts`, `features/mr-status/count-unresolved.test.ts` — small, self-contained pure modules with exhaustive case enumeration.
- `server/gitlab/mr-status.test.ts`, `server/gitlab/mr-key-map.test.ts`, `server/gitlab/mr-service.test.ts` — server-side composition layered on injected gateways. The new review-service tests follow the same gateway-injection pattern.

## Out of Scope

- MRs *I authored* — already covered by the existing GitLab MR status feature. This PRD only adds the reviewer-side stream.
- A separate review-mode panel surface inside the detail panel. The detail panel is unchanged for review-mode tickets aside from the "Open MR" link in the header.
- Drag-and-drop or pill-driven Jira transitions on review cards. The pill is non-interactive on review cards; transitions remain owned by the assignee on Jira-work cards.
- Auto-cascading transitions or merge-style desync warnings on review cards. A merged MR I reviewed simply lands as Review Accepted in Done; the assignee's Jira ticket may still be lagging, but that's the existing author-mode merged-warning's job to surface (on the assignee's card).
- Skeleton placeholders for the review-card lazy load. A one-time layout jump is accepted in exchange for not paying skeleton complexity.
- Notifications (browser, sound, badge) for new review assignments. The 60-second poll + visual `entering` animation is the surface area.
- Cross-project review discovery. The MR-title regex is keyed off `JIRA_PROJECT_KEY`, mirroring the parent feature; cross-project review-MRs are out of scope.
- A persistent "GitLab degraded" indicator in the header for review-mode failures specifically. Silent degradation only — same rule as the existing GitLab integration.
- Retiring `getMrApprovals` and re-routing author-mode through the new `/reviewers` endpoint. Deliberately deferred to a separate cleanup PR to keep this feature's diff focused; the side benefit (reachable `red-solid` `requested_changes` state in author-mode) ships there.
- A configurable target lane / status when a Review Accepted card is merged. Done is hardcoded; no per-status mapping.
- Multi-MR consolidation: two MRs referencing the same Jira key produce two cards. No "merge into one card" UI.
- Review state on cards within the detail panel's properties rail. Review-ness stays a board-level concern.
- Light theme variants for the new pill colors. The app is dark-only.

## Further Notes

- The review-state mapping deliberately treats `reviewed` (commented, no verdict) as Needs Review rather than its own bucket. The justification is "you still owe a decision" — adding a fourth bucket would dilute the loud Needs Review signal without giving the user a different action.
- "Re-requested review" is not a separate GitLab state — re-requesting resets the reviewer to `unreviewed`, which already maps to Needs Review. No special-casing needed.
- The `merge_request_interaction.approval_status` field referenced in the parent GitLab MR status PRD turned out *not* to be present on the standard `GET /merge_requests/:iid` REST response. The dedicated `/reviewers` endpoint is the authoritative source for per-reviewer state. This finding also unblocks the future cleanup of author-mode (the `requested_changes` red-solid branch is currently dead code).
- The view-model module is the deep-module seam between "where this card came from" and "how it renders". Future card kinds (notification cards, system-health cards) extend the view-model module rather than `TicketCard` itself.
- The polling cadence and lazy-load gating are deliberately identical to author-mode, so the user's mental model of "everything refreshes together every minute" remains a single concept.
- The `READY TO PICK` rename is a one-line display change inside the status-color module (display-name override). All Jira-side strings — JQL, transition names, pill keys — stay `Reviewed`.

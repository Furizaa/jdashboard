# 17 — MR review row end-to-end

**Type:** AFK

## Parent

[GitLab MR status PRD](../prds/gitlab-mr-status.md)

## What to build

The spine of the feature: the full happy-path slice that takes raw GitLab API data and produces the reviewer-avatar row under the divider on Code Review cards.

- Extend `src/server/gitlab/client.ts` with three new methods:
  - `listMrs({ state, updatedAfter, authorUsername })` — calls `/api/v4/projects/<encoded path>/merge_requests`.
  - `getMr(iid)` — calls `/api/v4/projects/<encoded path>/merge_requests/<iid>`, returns full MR detail including `reviewers[].merge_request_interaction`.
  - `getMrDiscussions(iid)` — calls `/api/v4/projects/<encoded path>/merge_requests/<iid>/discussions`.
- New pure modules in `src/server/gitlab/`:
  - `mr-key-map.ts` — `(mrs, projectKey) → Record<jiraKey, MrSummary>` using the regex `\b{projectKey}-\d+\b` against MR titles. On multi-MR-per-key, most-recent by `updated_at` wins.
  - `mr-status.ts` — summarizer producing the discriminated union `{ kind: 'merged' | 'draft' | 'no-reviewers' | 'review', ... }` with the precedence: merged > draft > no-reviewers > review. The `review` variant carries per-reviewer state and the unresolved-thread count.
- New pure modules in `src/features/mr-status/`:
  - `reviewer-state.ts` — `(approvalStatus, hasNotesFromReviewer, unresolvedFromOthers) → 'gray-dashed' | 'blue-dashed' | 'red-solid' | 'green-solid' | 'green-dashed'`. Implements the table from the PRD, including the unreviewed-but-commented → blue upgrade.
  - `count-unresolved.ts` — `(discussions, currentUsername) → number` counting threads where `resolvable && !resolved && firstNote.author.username !== currentUsername`. Same definition is reused by the summarizer to decide between solid-green and dashed-green.
- New server function `getMrStatuses` in `src/server/gitlab/server-functions.ts`:
  - Reads `JIRA_PROJECT_KEY` and `JIRA_DONE_WINDOW_DAYS` from existing env, resolves the cached current username.
  - `listMrs` with `state[] = opened|merged`, `author_username = <currentUser>`, `updated_after = now − JIRA_DONE_WINDOW_DAYS days`.
  - `mr-key-map` filters to MRs whose title matches the project-key regex.
  - For each matched MR, fetches detail + discussions in parallel.
  - Runs the summarizer to produce per-key `MrSummary`.
  - Returns `{ ok: true, byKey: Record<jiraKey, MrSummary> } | { ok: false, reason: 'unauthorized' }`.
- New `src/features/mr-status/use-mr-statuses.ts` hook:
  - Single TanStack Query keyed `['mr-statuses']`, calling `getMrStatuses`.
  - `enabled` gated on the Jira board query having resolved at least once (lazy-after-Jira).
  - `usePolling` driving 1-minute refetch (paused on hidden tab, refetched on focus, identical to the existing board polling).
  - Per-card export `useMrStatus(jiraKey)` that uses TanStack Query's `select` to project a single key's slice — every card shares the same network request and cache entry.
  - On any error other than success, returns `null` (silent degradation).
- New `src/features/mr-status/MrSection.tsx` — chooses what to render based on `column` and the summarised state. **In this slice:**
  - Returns `null` for TO DO, In Implementation, and Done columns.
  - For Code Review:
    - While loading: skeleton row (one shimmer line) under a divider.
    - On `kind === 'review'`: divider + reviewer-avatar row + unresolved-count chip + green-celebration tint when applicable.
    - On any other `kind` ('merged', 'draft', 'no-reviewers'): returns `null`. (Wired up in slices 18–20.)
- New `src/features/mr-status/ReviewerAvatar.tsx`:
  - 20px circular avatar.
  - Outline ring (2px, `outline-offset: 1px`) — dashed/solid + colour driven by reviewer-state output.
  - Native `title` tooltip: `<displayName> — <human-readable state>`.
- Reviewer-row overflow: cap visible avatars at 4, then render a `+N` chip matching the existing labels-row pattern in `TicketCard`.
- Approved-and-clean celebration: `bg-green-500/10` on the under-divider section only, with a subtle left accent (`border-l-2 border-green-500/40`). Card body unchanged.
- `src/features/board/Board.tsx` passes `column` as a prop to each `<TicketCard>`. `TicketCard` accepts a `column` prop and forwards it to `<MrSection issueKey={issue.key} column={column} />`. Render the section after the labels row.
- `src/features/mr-status/index.ts` barrel exporting `MrSection` and the `useMrStatuses` hook.
- Tests (Vitest), all colocated:
  - `mr-key-map.test.ts` — single key per title, multiple keys per title, no key, two MRs for same key with different `updated_at`, empty input.
  - `mr-status.test.ts` — precedence cases: merged input always returns `merged`; draft returns `draft`; open + zero reviewers returns `no-reviewers`; open with reviewers returns `review` with per-reviewer states populated.
  - `reviewer-state.test.ts` — every row in the PRD's mapping table, including the unreviewed-but-commented upgrade.
  - `count-unresolved.test.ts` — non-resolvable excluded, resolved excluded, threads started by current user excluded (including those with replies from others), mixed inputs, empty input.

## Acceptance criteria

- [ ] On initial load, the board renders without waiting for GitLab data.
- [ ] Code Review cards show a single shimmer skeleton row under a divider while MR data is in flight.
- [ ] After MR data arrives, Code Review cards with an open + non-draft + has-reviewers MR render a horizontal divider followed by a reviewer-avatar row.
- [ ] All five reviewer visual states render correctly: dashed gray (not started), dashed blue (commented or `reviewed`), solid red (`requested_changes`), solid green (`approved`, no unresolved), dashed green (`approved`, unresolved).
- [ ] An MR where every reviewer is approved with zero non-author unresolved threads renders the section with a green tint and a left accent; cards with at least one unresolved or non-approved reviewer do not.
- [ ] Unresolved-comment count chip (lucide `MessageSquare` + tabular-nums number) appears on the right of the reviewer row when count > 0; hidden when 0; tooltip shows "N unresolved comment threads".
- [ ] More than 4 reviewers collapse to a `+N` chip at the end of the row.
- [ ] Hovering an avatar shows a native tooltip with the reviewer's name and current state.
- [ ] TO DO and In Implementation cards never render an MR section, regardless of MR data.
- [ ] Done cards render no MR section in this slice (slice 20 wires up the desync warning).
- [ ] MR data refreshes every 60 seconds via `usePolling`; pauses when the tab is hidden and refetches immediately on focus.
- [ ] On any GitLab error (auth failure, network failure, 5xx), the MR section disappears silently across all cards; the rest of the board keeps working.
- [ ] All four pure modules are unit-tested per the PRD's testing decisions.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

- [16 — GitLab auth health check](./16-gitlab-auth.md)

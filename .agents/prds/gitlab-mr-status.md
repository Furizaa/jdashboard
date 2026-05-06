# clashboard — GitLab MR status on Code Review and Done cards

## Problem Statement

Today the clashboard's "In Code Review" column tells me a ticket is in code review, but nothing about whether the merge request that *belongs* to that ticket has reviewers, has been approved, has unresolved comments, is still a draft, or has already been merged. To answer any of those questions I leave the board, switch to GitLab, find the MR, eyeball the reviewer states, and switch back. The cost of that context-switch is high enough that I either don't do it (and the board stays a lie about my real state) or I do it constantly (and the board becomes a worse version of GitLab).

A second related symptom: my Jira ticket and my GitLab MR drift apart. An MR gets merged but the ticket stays in "In Code Review". A ticket gets transitioned to STG/QA/UAT but the MR is still open and forgotten. Today nothing on the board surfaces those desyncs; I find out about them when somebody asks "wasn't that already merged?".

## Solution

For every Code Review card, render a section under a horizontal divider that summarises the matching MR: reviewers as avatars with state-driven rings, an unresolved-comments count, or — when the MR is in an unexpected state — an amber warning row that doubles as the action that fixes it. The matching MR is found by looking for the Jira project key (HDR-XXXX) in the MR title.

For Done-column cards we render only one signal: a desync warning when the matching MR is still open. Everything else (TO DO, In Implementation, Done with merged MR) shows nothing under the card — silence is the right answer when the system is consistent.

GitLab data is loaded lazily after Jira data so the board paints fast. Both data sources share the same 1-minute polling cadence and the same manual refresh button. GitLab errors degrade silently — the board is the primary product and it never goes dark because the enrichment broke.

## User Stories

1. As a developer, I want every Code Review card to show a horizontal divider with an MR summary underneath, so that I can read the MR's review state without leaving the board.
2. As a developer, I want the matching MR to be discovered by scanning MR titles for the ticket key, so that I do not need any other linkage between Jira and GitLab.
3. As a developer, I want MR data to load *after* the Jira board has rendered, so that the initial paint of the board is never blocked by a slower GitLab call.
4. As a developer, I want a skeleton row to reserve space under the divider on Code Review cards while MR data is loading, so that the layout does not jump when data arrives.
5. As a developer, I want a Code Review card with no matching MR to show an amber warning row, so that I notice when I have forgotten to push or open a branch.
6. As a developer, I want a Code Review card whose MR is in draft to show a single amber draft-warning row, so that I notice the MR is not actually ready for review.
7. As a developer, I want clicking the draft warning to open the MR in a new tab, so that I can mark it ready or delete it without first finding it in GitLab.
8. As a developer, I want a Code Review MR with zero assigned reviewers to show an amber warning row, so that I notice when nobody has been asked to review yet.
9. As a developer, I want a Code Review MR with reviewers to show those reviewers as a row of small avatars, so that I can see at a glance who is on the hook for this MR.
10. As a developer, I want each reviewer's avatar border to encode their review state (color + dashed/solid), so that one glance at the row tells me where the review stands.
11. As a developer, I want a reviewer who has not started the review to render with a dashed gray ring, so that "not started" is the most visually quiet state.
12. As a developer, I want a reviewer who has commented but neither approved nor requested changes to render with a dashed blue ring, so that I can see in-progress reviews distinct from not-yet-started ones.
13. As a developer, I want a reviewer who has requested changes to render with a solid red ring, so that blocked reviews stand out immediately.
14. As a developer, I want a reviewer who has approved with no remaining unresolved threads from non-authors to render with a solid green ring, so that fully-clean approvals are unambiguous.
15. As a developer, I want the entire MR section to take on a noticeable green tint when every assigned reviewer has approved with no unresolved comments, so that I can scan the board for "ready to merge" cards.
16. As a developer, I want a reviewer who has approved but unresolved threads remain to render with a dashed green ring, so that I notice when an approval is conditional on resolving discussion threads.
17. As a developer, I want the number of unresolved comment threads (only those not started by me) to be shown as a small chip on the right of the reviewers row, so that I have a quantitative "how much is left" signal alongside the qualitative reviewer rings.
18. As a developer, I want hovering a reviewer's avatar to show their name and current review state in a tooltip, so that I can identify reviewers without leaving the board.
19. As a developer, I want the reviewer row to show at most four avatars and collapse the rest to a "+N" chip, so that the card never overflows when an MR has many reviewers.
20. As a developer, I want a Code Review card whose MR is already merged to show an amber warning, so that I notice that the ticket is in the wrong column and needs to move.
21. As a developer, I want clicking the merged-warning row to transition the ticket directly to "In STG", so that fixing the desync is a single click rather than a trip through Jira.
22. As a developer, I want a "View MR" link on the merged-warning row, so that I can still inspect what got merged before — or instead of — moving the ticket.
23. As a developer, I want a transition error (e.g. no direct transition to "In STG" available) to surface as a toast rather than chain through intermediate states, so that I am never surprised by side-effects from auto-cascaded transitions.
24. As a developer, I want a Done-column card whose MR is still open to show an amber desync warning, so that I notice when I moved a ticket forward but forgot to merge.
25. As a developer, I want clicking the Done desync warning to open the MR in a new tab, so that I can decide for myself whether the MR or the ticket is wrong.
26. As a developer, I want TO DO and In Implementation cards to show no MR section at all, so that the board stays visually quiet for cards where MR state is not yet meaningful.
27. As a developer, I want Done cards with a merged MR to show no section at all, so that consistent state is rewarded with silence.
28. As a developer, I want MR data to refresh on the same 1-minute polling cadence as the Jira board, so that the board's freshness model stays a single concept.
29. As a developer, I want polling for MR data to pause when the tab is hidden and refetch on focus, so that GitLab API budget is not wasted on tabs I am not watching.
30. As a developer, I want the manual refresh button to refresh the board *and* the MR data together, so that "give me everything fresh" is one click.
31. As a developer, I want GitLab errors to degrade silently — the board keeps working, the MR section just disappears — so that a flaky GitLab does not break my Jira workflow.
32. As a developer, I want the first GitLab 401 of a session to surface a one-time toast, so that misconfiguration of `GITLAB_TOKEN` is loud the first time but not nagging afterwards.
33. As a developer, I want the GitLab base URL, project path, and token to be configurable via `.env`, so that swapping projects or migrating to a self-hosted GitLab does not require code changes.
34. As a developer, I want my GitLab username to be derived from the GitLab `/user` endpoint at runtime, so that I do not have to keep yet another value in `.env` in sync.
35. As a developer, I want the project key portion of the MR-title regex to be derived from `JIRA_PROJECT_KEY`, so that the same code base works for any Jira project without a hardcoded prefix.
36. As a developer, I want the MR-section visual language to match the existing Linear-inspired aesthetic of the board (small avatars, restrained color, subtle dividers), so that the new section feels native rather than bolted on.

## Implementation Decisions

### Stack additions

- No new top-level dependencies. The MR section is built from the existing primitives: TanStack Query, lucide-react, Tailwind, shadcn `cn` helper. Tooltips on avatars use the native `title` attribute — same pattern as the existing labels row.

### GitLab API client

- A new server-side client mirroring the existing Jira client: a `request<T>` wrapper that injects the `PRIVATE-TOKEN` header, parses JSON, throws `GitlabAuthError` on 401 and `GitlabHttpError` on other non-OK responses.
- Public methods: `getCurrentUser`, `listMrs`, `getMr`, `getMrDiscussions`. Nothing else — the integration is read-only.
- The current GitLab username is fetched once per server process (lazy on first call) and cached for the lifetime of the process. Replaces the need for a `GITLAB_USERNAME` env var.

### Auth and configuration

- Three new required env vars, validated at server boot like the existing Jira ones: `GITLAB_BASE_URL`, `GITLAB_TOKEN`, `GITLAB_PROJECT_PATH`.
- `GITLAB_TOKEN` requires only `read_api` scope. The integration never writes to GitLab — Jira transitions handle the only write side-effect.
- A missing or empty value fails loud with a console error pointing to `.env.example`. Mirrors the existing Jira validation behaviour.

### Data scope and discovery

- A single server function returns a map keyed by Jira ticket key (e.g. `HDR-18292`) to a per-MR status summary.
- The server function calls GitLab's project-scoped MR list endpoint with `author_username = <current user>`, `state[] = opened|merged`, `updated_after = now − JIRA_DONE_WINDOW_DAYS days`. Closed-not-merged MRs are not fetched and are treated as "no MR".
- For each returned MR the server fetches per-MR detail (for `reviewers[].merge_request_interaction.approval_status`) and discussions (for unresolved-thread counting and the unreviewed-but-commented detection). These per-MR calls are issued in parallel.
- Title matching uses a regex derived from `JIRA_PROJECT_KEY`: `\b{KEY}-\d+\b` matched anywhere in the MR title.
- An MR title may contain multiple ticket keys; one MR can therefore satisfy multiple Jira cards.
- A ticket key may match multiple MRs in the result set; in that case the most recent by `updated_at` wins.

### Reviewer state mapping

A pure module reduces three signals to one of five visual states:

| Signal combination | Visual state |
| --- | --- |
| `approval_status = unreviewed`, no notes from this reviewer | dashed gray |
| `approval_status = unreviewed` with notes from this reviewer, OR `approval_status = reviewed` | dashed blue |
| `approval_status = requested_changes` | solid red |
| `approval_status = approved`, zero unresolved threads (excluding ones started by the MR author) | solid green + section-level green tint |
| `approval_status = approved`, ≥1 unresolved thread (excluding ones started by the MR author) | dashed green |

The "approved + zero unresolved" case is the only one that affects the section background; every other state colours the avatar ring only.

### Unresolved-comments rule

A pure module counts threads that satisfy all of: `resolvable === true`, `resolved === false`, `firstNote.author.username !== <current user>`. Non-resolvable threads (general comments) are ignored. The same rule decides between the solid-green and dashed-green ring for an approved reviewer — the count display and the visual decision are derived from one definition, not two.

### Display-state precedence

A pure summarizer reduces an MR to one of four output kinds, in this precedence:

1. **merged** → render the merged-warning row only (regardless of reviewer or thread state).
2. **draft** → render the draft-warning row only.
3. **no-reviewers** (open, not draft, zero assigned reviewers) → render the no-reviewers warning row.
4. **review** (open, not draft, ≥1 reviewer) → render the reviewer-avatar row plus the unresolved-count chip.

For the Done column, only the merged case ("ticket is consistent") and the open case ("desync warning") are meaningful; the Done-column branch in the section component picks one of those two and renders nothing for everything else.

### Polling, caching, lazy load

- A single shared TanStack Query (`['mr-statuses']`) holds the full key→status map. Each card's `<MrSection>` reads its own slice via the query's `select` option, so all cards share one network request and one cache entry.
- The query is gated `enabled: jiraQueryReady` so it does not fire until the Jira board has resolved at least once.
- Polling uses the existing `usePolling` hook at 1 minute, paused on hidden tab, refetched on focus. Identical semantics to the Jira polling — same hook, same cadence.
- The manual refresh button invalidates both the Jira board query and the MR-statuses query.
- Skeleton row reserves space under the divider on Code Review cards while the query is in-flight.
- On error or 401 the section renders nothing. A `GitlabAuthError` once per session triggers a toast pointing at `GITLAB_TOKEN`; subsequent auth failures are silent for the rest of the session.

### Card integration

- `Board.tsx` knows each card's column. It passes `column` as a prop to `TicketCard`, which forwards it to a new `<MrSection issueKey={key} column={column} />`.
- `MrSection` renders nothing for TO DO and In Implementation columns. For Code Review it routes to one of: skeleton, no-MR warning, draft warning, no-reviewers warning, merged warning, or the review row. For Done it routes to either the desync warning or nothing.
- The merged-warning row's primary click action invokes the existing transition mutation (the same one the status pill uses), with optimistic update, looking for a transition whose `to.name === 'In STG'`. If no such transition is available, a `sonner` toast surfaces the limitation.

### Visual tokens and layout

- 20px circular reviewer avatars, ~4px overlap, 2px outline ring with `outline-offset: 1px`. Dashed/solid is encoded via the outline style; color is encoded via the outline color.
- Native `title` tooltip per avatar with `<displayName> — <state>`.
- Unresolved-count chip uses lucide `MessageSquare` plus a tabular-nums number, hidden when zero.
- All warning rows share an amber palette (`bg-amber-500/10`) with lucide `AlertTriangle`. Severity is identical across the four cases — none are catastrophic, all are inconsistencies.
- The approved-and-clean celebration uses `bg-green-500/10` on the section under the divider only, with a subtle left accent. The card body itself is unchanged.
- The divider re-uses the existing border tokens (`border-t border-border/50`) and the same vertical rhythm as the labels row.
- Reviewer-avatar overflow at four; `+N` chip beyond, matching the labels-row pattern already used in `TicketCard`.

### Modules

- **GitLab API client** (server): fetch wrapper, auth header, error mapping. Public surface: `getCurrentUser`, `listMrs`, `getMr`, `getMrDiscussions`.
- **MR key map** (pure server): given a list of MRs and the project key, returns `{ [key]: MrSummary }` with most-recent-wins on conflict.
- **MR status summarizer** (pure server): given a per-MR detail, its discussions, and the current username, returns the discriminated union `{ kind: 'merged' | 'draft' | 'no-reviewers' | 'review', ... }`. Encapsulates the precedence rule and the per-reviewer state mapping.
- **Reviewer state** (pure shared): the table from "Reviewer state mapping" above as a single function, callable from the summarizer.
- **Unresolved-thread counter** (pure shared): the rule from "Unresolved-comments rule" above as a single function.
- **MR statuses server function**: orchestrates list → per-MR detail/discussions in parallel → summarizer → key map.
- **`useMrStatuses` hook** (client): TanStack Query wrapper, gated on Jira readiness, shared cache, per-card slice via `select`.
- **`MrSection`** (client): chooses skeleton / warning / review row based on column and summarised state.
- **`ReviewerAvatar`** (client): 20px avatar with state-driven outline, `title` tooltip.
- **`MrWarning`** (client): the warning row; takes an icon, text, optional click handler, and optional "View MR" link.

## Testing Decisions

### What makes a good test

Same principle as the existing PRD: tests assert a module's input/output contract, not its internal structure. Pure-function modules are tested directly with input/output. React components that are mostly composition are validated by manually opening the running app, not unit tests.

### Modules to test (Vitest)

- **Reviewer state** — table-driven: every combination of `approval_status × hasNotesFromReviewer × unresolvedCountFromOthers` produces the expected visual state. Covers the unreviewed-but-commented upgrade explicitly.
- **Unresolved-thread counter** — non-resolvable threads excluded, resolved threads excluded, threads started by the current user excluded (including ones with replies from others), counts mixed cases correctly.
- **MR key map** — title with one key, title with multiple keys, title with no key, two MRs for the same key (most-recent wins by `updated_at`), empty input.
- **MR status summarizer** — precedence: merged input always returns `merged` regardless of other fields; draft returns `draft`; open + zero reviewers returns `no-reviewers`; open with reviewers returns `review` with the per-reviewer states populated.

### Modules not tested at the unit level

- The GitLab client (thin fetch wrapper; matches the existing decision to not unit-test the Jira client).
- The `useMrStatuses` TanStack Query hook (configuration only).
- `MrSection`, `ReviewerAvatar`, `MrWarning` (composition layers; manually verified).

### Prior art

The pure-function test patterns already in the repo — `features/board/status-mapping.test.ts`, `features/board/filter-issues.test.ts`, `server/jira/jql.test.ts`, `features/ticket-card/hash-color.test.ts` — are the templates. No new test infrastructure required.

## Out of Scope

- GitHub support, or any non-GitLab forge.
- Multi-project / group-wide / instance-wide MR search. Single project, configurable.
- MRs authored by other people — even when an MR for "my" ticket happens to be authored by a teammate.
- Closed-not-merged MRs. Treated identically to "no MR".
- CODEOWNERS / required-vs-optional reviewer distinctions in the avatar row.
- A confirmation dialog before the merged-warning click moves the ticket. The optimistic single-click pattern matches the existing status pill.
- Auto-cascading multi-step transitions when "In STG" is not directly reachable.
- Real-time GitLab webhook updates. The 1-minute polling cadence matches the rest of the app.
- Rendering branch / commit refs from Jira's "Development" panel. Already out of scope in the parent PRD; restated for clarity.
- Moving a Done-column ticket *back* to In Code Review on a desync. The Done-desync warning opens the MR for human investigation; the action is yours, not the app's.
- A persistent "GitLab degraded" indicator in the header. Silent degradation only.
- A configurable target status for the merged-warning click. "In STG" is hardcoded as a constant in the gitlab feature module.
- A light theme variant of the green-celebration section. The app is dark-only.

## Further Notes

- The MR-title regex is derived from `JIRA_PROJECT_KEY` so the same code works for any Jira project.
- Reusing `JIRA_DONE_WINDOW_DAYS` as the GitLab `updated_after` window keeps both data sources bounded by the same time horizon, which avoids one drifting past the other.
- The "approved + zero unresolved → green section background" treatment is deliberately the only loud visual signal in this feature. It is the one state that is genuinely actionable: the card is ready to merge.
- All warning rows are amber rather than red because none of them are catastrophic. They are nudges about inconsistencies, not error states.
- The summarizer's discriminated union is the seam between the GitLab side and the React side. Tests pin the union; the React layer can be redesigned freely without breaking tests.

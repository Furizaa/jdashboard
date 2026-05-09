# Review (server) — context

The **Review** server context surfaces GitLab merge requests where the current user is a reviewer, paired with their referenced Jira issues. It powers the client-side Review surface (fake review cards on the column grid).

## Boundary

- **What it owns:** the `loadReviewCards` use-case — fan-out across MR detail/discussions/approvals/reviewers, bucketing logic (needs-review / rejected / accepted), and the merge with Jira metadata extracted from MR titles.
- **What it does not own:** the GitLab and Jira wire formats (those are gateway-output types), the MR-status overlay on Board (that's `contexts/board/application/load-mr-statuses.ts`), and any UI rendering.

## Dependencies

Review depends on **two gateway ports as peers**:

- `JiraGateway` — for the bulk Jira lookup (resolving title-extracted keys to `BoardIssue`).
- `GitlabGateway` — for the MR fan-out and the current-user query.

Plus:

- `ReviewConfig` — `jiraProjectKey`, `lookbackDays`, `hideLabels`, `baseUrl`.
- Effect's built-in `Clock` — for the `updatedAfter = now − lookbackDays` window.

## Cross-namespace coupling — resolved

Pre-Effect, `server/gitlab/review-service.ts` imported `JiraIssueService` directly from `server/jira/`. That smuggled cross-system orchestration into the GitLab folder, breaking the "gateway folder owns one external system" rule.

In the new layout, `loadReviewCards` lives in **Review's application layer** and depends on both gateway Tags as peers. The cross-namespace coupling no longer exists at the folder level — it's structurally correct cross-system orchestration in the only place it belongs: a context application service.

## Concurrency

Per Q11.3 of the PRD, the per-MR fan-out caps concurrency at 5 (`Effect.all(..., { concurrency: 5 })`). Inside one MR, the four sub-calls (`getMr`, `getMrDiscussions`, `getMrApprovals`, `getMrReviewers`) run unbounded.

## Error policy

- `Unauthorized` from any gateway propagates as a **tagged failure** on the wire.
- `NotFound` / `Rejected` from a single MR's fan-out drop that MR but keep the rest (a single bad MR doesn't kill the whole list).
- `NotFound` / `Rejected` from `getCurrentUser`, `listMrs`, and the bulk Jira lookup are unexpected and become **defects** (`Effect.die`) — they surface as `InternalError` at the wire boundary.

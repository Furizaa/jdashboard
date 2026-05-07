# 29 — Quick Create dynamic in-progress epics in Parent dropdown

**Type:** AFK

## Parent

[Quick Create PRD](../prds/quick-create.md)

## What to build

Add a second section to the Parent dropdown listing the user's in-progress epics within the configured project. The list is fetched lazily when the modal opens and cached for 5 minutes. The dropdown becomes a two-section layout: "Pinned" (the three hardcoded entries from slice 26) on top, then a thin divider, then "My in-progress epics" — with skeleton-row loading, empty-state line, and error-fallback retry.

- New pure module `src/server/jira/epic-jql.ts`:
  - Public `buildEpicJql(projectKey: string): string` returning the literal `issuetype = Epic AND assignee = currentUser() AND status = "In Progress" AND project = "${projectKey}"`. Project key is double-quoted to be safe with hyphens or unusual characters.
- New server function in `src/server/jira/server-functions.ts`:
  - `getMyEpics` — `createServerFn({ method: 'GET' })` that calls `jiraClient.searchIssues(buildEpicJql(env.JIRA_PROJECT_KEY), ['summary'])` and projects each issue to `{ key, summary }`. Returns the discriminated `{ ok: true; epics: Array<{ key: string; summary: string }> } | { ok: false; reason: 'unauthorized' }`. Mirrors the error-handling shape of the existing `searchIssues` server function.
- New client hook `src/features/quick-create/use-my-epics.ts`:
  - TanStack `useQuery` wrapping `getMyEpics`. Query key `['my-epics']`. `staleTime: 5 * 60_000`. Accepts an `enabled` arg from the caller (the modal passes `open` so the query only fires when the modal is open).
- Refactor the Parent dropdown in `src/features/quick-create/QuickCreateForm.tsx` (or extract to `src/features/quick-create/ParentSelect.tsx`):
  - Two-section layout in the popover content. Section headers ("Pinned" and "My in-progress epics") rendered as small muted labels. A thin divider between sections (use the existing `border-border/50` token).
  - Pinned section renders the three `HARDCODED_PARENTS` entries unchanged.
  - Dynamic section behavior:
    - While `useMyEpics` is loading: render one skeleton row in the dynamic section.
    - On success with results: render each epic as `KEY · Summary` (key in muted monospace, summary in foreground). Same row component as the pinned entries.
    - On success with zero results: render a muted single-line "No active epics assigned to you" inside the dynamic section.
    - On error: render a muted "Failed to load epics — retry" line where "retry" is a button that triggers `refetch()`. The pinned section remains usable throughout.
  - Each row, regardless of section, sets the form's `parentKey` field on click and closes the popover.
- No new client tests — `<ParentSelect>` is composition. The new `buildEpicJql` pure function is testable.
- New test `src/server/jira/epic-jql.test.ts`:
  - Standard project key (`"HDR"`) produces the expected literal JQL.
  - A project key with hyphens (e.g. `"DR-FE"`) is correctly double-quoted in the output.

## Acceptance criteria

- [ ] Opening the Quick Create modal triggers a fetch of the user's in-progress epics within `JIRA_PROJECT_KEY`.
- [ ] The Parent dropdown shows two visually separated sections: "Pinned" (top) and "My in-progress epics" (below a divider).
- [ ] The Pinned section renders immediately on modal open with the three hardcoded entries.
- [ ] While epics are loading, a skeleton row appears in the dynamic section.
- [ ] When epics load successfully, each is rendered as `KEY · Summary`. Picking one sets the form's parent and closes the popover.
- [ ] When the user has zero in-progress epics, the dynamic section shows the muted "No active epics assigned to you" line.
- [ ] When the epic query fails, the dynamic section shows "Failed to load epics — retry" and the retry button refetches. The pinned section remains usable throughout.
- [ ] Reopening the modal within 5 minutes does not refetch (the query is cached via `staleTime`).
- [ ] `buildEpicJql` is unit-tested for the project-key contract.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

- 26 (Quick Create MVP)

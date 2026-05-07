# 31 — Quick Create toast actions + parsed Jira error messages

**Type:** AFK

## Parent

[Quick Create PRD](../prds/quick-create.md)

## What to build

Polish the success and failure toasts. The success toast gains two action buttons: `Open` (opens the new ticket's detail panel via `?issue=HDR-XXXX`) and `View in Jira` (opens the new ticket in Jira in a new tab). The failure toast surfaces the parsed Jira error message — already extracted by the existing `parseJiraErrorMessage` helper — instead of the generic placeholder from slice 26.

- Refactor `src/features/quick-create/use-create-issue-mutation.ts`:
  - On success, replace the placeholder `sonner` toast with one that includes two `action` buttons (sonner's `toast.success(message, { action: ... })` API supports a single primary action; if two actions are needed render a custom toast component or use sonner's `cancel` slot for the secondary action — pick whichever sonner v1 actually supports without forking):
    - `Open` — calls into the existing route helper used by ticket cards to set the `?issue=<KEY>` search param. Reuse the same navigation hook the cards use rather than reimplementing URL manipulation.
    - `View in Jira` — `window.open(\`${baseUrl}/browse/${key}\`, '_blank', 'noopener,noreferrer')`. The `baseUrl` is already returned by other server functions (e.g. `searchIssues` returns `baseUrl`); thread it through `createIssue`'s success result so the client doesn't need a separate fetch.
  - On non-timeout failure, replace the generic message with the `result.message` field returned by the server function — already populated by `parseJiraErrorMessage` in slice 26. The toast title can be `"Failed to create ticket"` and the description is the parsed Jira message.
  - Timeout failures continue to use the `"Request timed out — try again"` message from slice 30 — that path is independent of Jira's own error reporting.
- Refactor `src/server/jira/server-functions.ts` `createIssue`:
  - On success, return `{ ok: true; key: string; baseUrl: string }` — adding `baseUrl` so the toast actions can link without a second roundtrip.
- No new tests.

## Acceptance criteria

- [ ] The success toast shows `Created HDR-XXXX` plus two buttons: `Open` and `View in Jira`.
- [ ] Clicking `Open` opens the new ticket in the existing detail panel (the `?issue=KEY` URL parameter is set and the panel renders).
- [ ] Clicking `View in Jira` opens `${JIRA_BASE_URL}/browse/HDR-XXXX` in a new tab with `noopener,noreferrer`.
- [ ] When Jira rejects the create with a specific error (e.g., a field unsupported on a type's create screen), the failure toast surfaces that specific error message instead of a generic placeholder.
- [ ] Timeout failures still show "Request timed out — try again" (slice 30 behavior unchanged).
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

- 26 (Quick Create MVP)

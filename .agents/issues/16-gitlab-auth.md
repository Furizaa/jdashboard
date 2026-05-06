# 16 — GitLab auth health check

**Type:** HITL

## Parent

[GitLab MR status PRD](../prds/gitlab-mr-status.md)

## What to build

Bootstrap the GitLab side of the integration and prove end-to-end that the GitLab API token works, before any of the feature logic is built on top.

- Add three new required env vars: `GITLAB_BASE_URL`, `GITLAB_TOKEN`, `GITLAB_PROJECT_PATH`. Add them to `.env.example` and extend `src/server/env.ts` validation. Missing or empty values fail loud at server boot with a console error pointing at `.env.example`, mirroring the existing Jira validation behaviour.
- New `src/server/gitlab/client.ts` mirroring `src/server/jira/client.ts`:
  - `request<T>` wrapper that injects the `PRIVATE-TOKEN` header, parses JSON, and throws `GitlabAuthError` on 401 and `GitlabHttpError` on other non-OK responses.
  - Single method exposed in this slice: `getCurrentUser()` calling `/api/v4/user`.
  - Module-level lazy cache for the current GitLab username — fetched once per server process from `/api/v4/user` and cached for the process lifetime so subsequent slices can reuse it.
- New `src/server/gitlab/server-functions.ts` exposing `getGitlabUser()`, returning `{ ok: true, username, displayName } | { ok: false, reason: 'unauthorized' }`.
- New `src/server/gitlab/index.ts` barrel.
- Brief in-app verification — a small "GitLab ✓ `<username>`" indicator added next to the existing Jira user info in the header. On `getGitlabUser` failing with `unauthorized`, render a muted "GitLab ✗" pill instead of the success indicator (silent degradation, per the PRD).
- Folder structure: `src/server/gitlab/{client.ts, server-functions.ts, index.ts}`.

## Acceptance criteria

- [ ] Removing any of `GITLAB_BASE_URL`, `GITLAB_TOKEN`, `GITLAB_PROJECT_PATH` causes a clear console error at server boot pointing to `.env.example`, and the server does not start.
- [ ] With a valid token, the header shows "GitLab ✓ `<username>`" with the username resolved from `/api/v4/user`.
- [ ] With an invalid token, the header shows a muted "GitLab ✗" pill; the rest of the app continues working normally.
- [ ] `GITLAB_TOKEN` does not appear in the browser bundle, network tab, or DevTools (verified manually).
- [ ] The username is fetched only once per server process, not on every server-function call.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass on a clean checkout.

## Blocked by

None — can start immediately.

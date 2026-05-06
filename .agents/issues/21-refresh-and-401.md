# 21 — Manual refresh integration + one-time GitLab 401 toast

**Type:** AFK

## Parent

[GitLab MR status PRD](../prds/gitlab-mr-status.md)

## What to build

Two small chunks bundled because each is too small to stand alone.

- **Manual refresh integration.** The existing manual refresh button (issue 11) currently invalidates only the board issue list query. Update its handler to also invalidate the `['mr-statuses']` query so a single click refreshes both data sources together.
- **One-time GitLab 401 toast.**
  - Module-level boolean flag in the gitlab feature module tracking whether the auth-failure toast has already fired this session.
  - When `useMrStatuses` (or the underlying server function) resolves with `{ ok: false, reason: 'unauthorized' }` and the boolean is still false, fire a `sonner` toast — "GitLab auth failed — check `GITLAB_TOKEN`" — and flip the boolean.
  - All subsequent `unauthorized` results in the same session continue to degrade silently (no toast, no banner).
- Verification is manual per the PRD.

## Acceptance criteria

- [ ] Clicking the manual refresh button invalidates both the board issue list and the `mr-statuses` query, and both refetch.
- [ ] The first GitLab `unauthorized` response of a session surfaces a `sonner` toast pointing at `GITLAB_TOKEN`.
- [ ] Subsequent `unauthorized` responses in the same session do not surface additional toasts.
- [ ] The toast does not fire on transient errors (network failures, 5xx) — only on `unauthorized` specifically.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

- [17 — MR review row end-to-end](./17-mr-review-row.md)

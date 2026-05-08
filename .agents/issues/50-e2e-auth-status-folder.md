# 50 — E2e: auth-status folder specs

**Type:** AFK

## Parent

[E2e harness PRD](../prds/e2e-harness.md)

## What to build

Two scenario specs covering the auth-status feature folder. Reuses the one-shot override mechanism introduced in slice 46.

- `tests/e2e/auth-status/jira-401.spec.ts` — register `mocks.failNext('GET /jira/rest/api/3/myself', { status: 401 })` (or whichever `myself`-equivalent endpoint the codebase calls at boot); navigate to `/`; assert the full-screen "Invalid Jira credentials" message renders with a link to `https://id.atlassian.com/manage-profile/security/api-tokens`. Assert the rest of the app does not render (the board is not visible).
- `tests/e2e/auth-status/gitlab-401-toast.spec.ts` — let the Jira board boot normally; register a 401 override on a GitLab endpoint inside the author-mode pipeline; advance clock to trigger the lazy GitLab fetch; assert exactly one Sonner toast surfaces (the GitLab-auth toast); register a *second* 401 on a different GitLab endpoint within the dedupe window; advance clock; assert *no* additional toast appears (the one-time-per-session dedupe is exercised). Repeat the assertion against the review-mode pipeline (after slice 49 is in tree) — confirm the dedupe set is shared across author-mode and review-mode.
- Extend `src/lib/testids.ts` only as needed: `authErrorScreen` (or rely on `getByRole('heading')` with the message text). Toasts use the Sonner role.
- No source-under-test changes beyond testid additions.

## Acceptance criteria

- [ ] Both specs pass on a clean checkout.
- [ ] Jira 401 spec asserts the full-screen state via the heading text and the API-tokens link's href, not via a CSS selector.
- [ ] GitLab 401 spec asserts the dedupe rule directly: exactly *one* toast appears across two 401 events in the same session.
- [ ] If slice 49 is already merged, the GitLab 401 spec asserts the shared dedupe across author-mode and review-mode (both can produce 401 in one session and only one toast appears).
- [ ] No structural CSS selectors.
- [ ] `pnpm typecheck` and `pnpm lint` pass.

## Blocked by

- 46 — E2e status-pill folder (introduces one-shot overrides)

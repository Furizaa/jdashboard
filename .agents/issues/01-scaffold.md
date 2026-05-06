# 01 — Scaffold + auth health check

**Type:** HITL

## Parent

[clashboard PRD](../prds/clashboard.md)

## What to build

Bootstrap the TanStack Start app and prove end-to-end that the Jira API token works.

- Scaffold a TanStack Start project. Verify the latest published versions of every dependency against the npm registry **at scaffold time** before pinning: TypeScript, React, `@tanstack/react-start`, `@tanstack/react-router`, `@tanstack/react-query`, Tailwind v4 (`@tailwindcss/vite`), shadcn CLI, oxlint, oxfmt (fallback to Prettier with a note if oxfmt isn't ready for daily use), Vitest, `sonner`, `lucide-react`, `date-fns`, `clsx`, `tailwind-merge`.
- Tailwind v4 with CSS-first `@theme` config and dark theme applied globally on `<html>`.
- shadcn initialized with the dark-first theme.
- `.env.example` listing every required env var (`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`, `JIRA_LABEL_FILTER`, `JIRA_DONE_WINDOW_DAYS`).
- Server-only env loader that reads from `process.env` and validates at boot — missing/empty value fails loud with a console error pointing at `.env.example`.
- Server-side Jira API client with HTTP Basic auth (`email:token` base64), a single `getMyself()` method calling `/rest/api/3/myself`.
- Single page (`/`) that calls the `getMyself` server function via TanStack Query and renders one of:
  - "Authenticated as `<displayName>`" with the user's avatar
  - Full-screen "Invalid Jira credentials" message + link to `https://id.atlassian.com/manage-profile/security/api-tokens` if the API returns 401
- Folder structure laid out per the PRD (`routes/`, `features/`, `server/jira/`, `lib/`, `components/ui/`, `styles/`).
- `pnpm` (or `npm`) scripts: `dev`, `build`, `lint`, `typecheck`, `test`.

## Acceptance criteria

- [ ] `pnpm dev` (or `npm run dev`) starts the app on `http://localhost:3000` (or whichever port TanStack Start defaults to).
- [ ] Removing any required env var causes a clear console error at server boot pointing to `.env.example`, and the server does not start.
- [ ] With a valid token, the app shows "Authenticated as `<displayName>`" with the user's avatar resolved from `/myself`.
- [ ] With an invalid token, the app shows the full-screen credentials error with the link to Atlassian's API token page.
- [ ] `JIRA_API_TOKEN` does not appear anywhere in the browser bundle, network tab, or DevTools (verified manually).
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` all pass on a clean checkout.
- [ ] Final pinned package versions noted in the PR description, with the date the registry was checked.
- [ ] Dark theme visibly applied (background dark, text light) on first load.

## Blocked by

None — can start immediately.

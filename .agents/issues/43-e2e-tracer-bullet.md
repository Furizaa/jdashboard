# 43 — E2e tracer bullet — Playwright + MSW + smoke spec

**Type:** AFK

## Parent

[E2e harness PRD](../prds/e2e-harness.md), [ADR 0001 — Mock at the network boundary](../../docs/adr/0001-mock-at-network-boundary-for-e2e.md)

## What to build

The foundation slice for the e2e harness. Forces every layer into existence by making one smoke spec pass end-to-end against a real built app with all outbound HTTP intercepted by an MSW Node sidecar.

After this slice merges, every subsequent feature-folder slice is purely additive — it extends the World, factories, and testids as its specs demand.

- Add devDependencies: `@playwright/test`, `msw`. Do not add `@mswjs/data` unless the World adopts it.
- `playwright.config.ts` at the repo root:
  - `webServer.command` runs `pnpm build` then starts the built TanStack Start server. `webServer.url` health-checks before tests run.
  - `globalSetup` boots the MSW sidecar on `127.0.0.1:9999`; `globalTeardown` closes it.
  - `workers: 1`. `use.testIdAttribute = 'data-testid'`. `use.timezoneId = 'UTC'`. Chromium only.
- `tests/e2e/` directory with its own `tsconfig.json` extending the root config and adding `@playwright/test` types. Excluded from the main project's `tsconfig.json` and from Vitest's `include` pattern (Vitest's pattern is `src/**/*.{test,spec}.{ts,tsx}`, so `tests/` is naturally excluded — confirm and document).
- `tests/e2e/world/World.ts`: minimal `World` class with `seedIssues`, `searchIssues` (board JQL only), `getMyself`, plus a `seedBaselineWorld()` helper. Mutations are visible on subsequent reads.
- `tests/e2e/fixtures/`: `makeIssue(overrides)` and `makeUser(overrides)` factories returning Atlassian-shaped JSON. Synthetic content only (e.g. `HDR-100: Lorem placeholder`).
- `tests/e2e/mocks/`: MSW handlers for `GET /jira/rest/api/3/myself` and `GET /jira/rest/api/3/search/jql` (or whichever search path the codebase uses). Handlers are thin: parse params, dispatch to the World, serialise via factories.
- `tests/e2e/mocks/server.ts` exports a typed handle for tests to register one-shot overrides later. Smoke spec does not use overrides.
- Per-test fixture (`tests/e2e/fixtures/test.ts`) builds a fresh `World` per spec, installs `page.clock` at `2026-05-08T12:00:00Z`, and exposes `world` and `mocks` on the Playwright `test` object.
- App-side test-mode plumbing:
  - Animation guard: a CSS rule keyed on a query-string flag (`?e2e=1`) or a test cookie that zeroes out transitions and animation durations. Applied globally.
  - `src/lib/testids.ts` exporting a frozen constant object. Initial entries: `ticketCard`. Components reference `testIds.ticketCard` rather than string literals.
  - `TicketCard` (or wherever the board card renders) emits `data-testid={testIds.ticketCard}` and `data-issue-key={issue.key}`.
- `tests/e2e/smoke.spec.ts`: navigates to `/?e2e=1`, seeds three issues via the World (one per visible column), waits for the board, asserts each card's `data-issue-key` is present and visible.
- `package.json` scripts: `test:e2e` (run once), `test:e2e:ui` (Playwright UI mode).
- `.gitignore` adds `playwright-report/`, `test-results/`, `playwright/.cache/`.
- A short `tests/e2e/README.md` for contributors: how to run, how to add a spec, how the World/factories/handlers compose.

## Acceptance criteria

- [ ] `pnpm test:e2e` builds the app, starts the built server, runs the smoke spec, and exits 0 on a clean checkout with valid `.env` containing the test-only env vars.
- [ ] Smoke spec passes against the MSW sidecar — no outbound traffic to real Atlassian or GitLab during the run (verify via Playwright trace or by running offline).
- [ ] `pnpm test:e2e:ui` opens Playwright UI mode and the smoke spec is runnable from there.
- [ ] `vitest` continues to pass unchanged. The e2e directory is not picked up by Vitest's runner.
- [ ] Removing the MSW sidecar (e.g. commenting out `globalSetup`) causes the smoke spec to fail with a clear network error, not a timeout — proving the app is actually dialing the sidecar.
- [ ] Animation guard verified: with `?e2e=1`, computed `transition-duration` on a card is `0s`. Without the flag, animations behave normally in dev.
- [ ] `src/lib/testids.ts` is the only place the `ticket-card` literal appears in the source tree (grep-verified).
- [ ] `pnpm typecheck` and `pnpm lint` pass with the new files.
- [ ] `tests/e2e/README.md` documents: how to run, how the World/factories/handlers/specs compose, and the rule "selectors prefer roles + accessible names; testids only as fallback".

## Blocked by

None — can start immediately.

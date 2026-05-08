# clashboard — e2e harness for refactor safety

## Problem Statement

A deep architectural refactor is planned that will split and merge source modules differently than they sit today. The existing test layer — Vitest unit tests on pure modules — moves with the code: as modules reshape, their tests get rewritten alongside. That is the right shape for unit tests, but it means the unit-test suite cannot serve as a stable safety net *during* the refactor. The composition layer (React component wiring, TanStack Query orchestration, server-function plumbing, URL state) currently has no automated coverage at all — the existing PRDs declare it manually verified by opening the running app.

Without an externally-anchored safety net, a refactor regression in the composition layer will only surface when the developer happens to click through the affected flow. Across ~110 user stories spanning two PRDs, that is a lot of clicking and a lot of room for silent breakage.

## Solution

A Playwright-based e2e harness that pins the **externally-observable behaviour** of the running app via the **HTTP network boundary**. Atlassian and GitLab API calls are intercepted by an MSW Node sidecar; the whole clashboard stack — server functions, gateways, query hooks, components — runs unmodified against a stateful in-memory `World` that the tests seed and mutate.

The harness covers ~35 scenario-level specs organised by feature folder, mirroring `src/features/*`. Each spec walks a user-visible flow end to end. Selectors prefer roles + accessible names; `data-testid` is centralised in `src/lib/testids.ts` for the cases roles cannot disambiguate. Tests run sequentially against a single built app instance booted by Playwright's `webServer`, with browser time pinned via `page.clock` and animations disabled in test mode.

The harness automates the manual-verification layer the existing PRDs declared. It does not replace Vitest for pure modules, does not screenshot-diff, does not check real-API contract drift, and does not run in CI.

## User Stories

1. As the refactor's author, I want a single command (`pnpm test:e2e`) to walk every user-visible flow against a live build of the app, so that I can refactor source modules with confidence that composition-layer regressions will surface before review.
2. As the refactor's author, I want the harness to keep working when I split, merge, or rename internal modules, so that I do not have to rewrite the safety net alongside the code it is protecting.
3. As the refactor's author, I want test failures to read as user-visible behaviour ("the card no longer shows status In Implementation") not internal structure ("this `<div>` lost its class"), so that diagnosing a failure does not require re-deriving the test's intent.
4. As the refactor's author, I want each spec to seed its own world from scratch, so that test ordering never affects outcomes.
5. As the refactor's author, I want polling to be deterministic and instant in tests, so that "fast-forward 60 seconds and assert a new poll" is a one-line operation rather than a real-time wait.
6. As the refactor's author, I want optimistic-update + rollback flows fully exercised, so that the most subtle composition behaviour in the app (status transitions) cannot regress silently.
7. As the refactor's author, I want HTTP error mapping (401, 5xx, network failure) exercised end-to-end, so that a refactor that breaks error routing surfaces in the harness rather than in production use.
8. As the refactor's author, I want the harness to use synthetic ticket content only, so that no real Jira/GitLab data lands in checked-in fixtures.
9. As the refactor's author, I want fixture factories (`makeIssue`, `makeMr`, …) to fill in the Atlassian/GitLab boilerplate fields, so that test-side seeds stay readable and focused on the per-test variables.
10. As the refactor's author, I want the harness to share the existing 60-second polling cadence and visibility-pause semantics (modulo time pinning), so that what tests exercise matches what users experience.
11. As the refactor's author, I want failure-path scenarios (transition rejections, GitLab 401, transient 5xx) declared as one-shot handler overrides on the World, so that failure tests read as "next call to X fails with Y" rather than choreographed handler scripts.
12. As the refactor's author, I want a small smoke layer (`tests/e2e/smoke.spec.ts`) that runs first, so that catastrophic breakage fails fast before the full suite runs.
13. As the refactor's author, I want spec organisation to mirror `src/features/*`, so that "what does feature X need to keep working?" is answered by reading one folder.
14. As the refactor's author, I want the harness to run against `pnpm build`'s output (not `pnpm dev`), so that the test target matches what users run and dev-only paths do not affect outcomes.
15. As the refactor's author, I want test IDs centralised in `src/lib/testids.ts` and used via constants in components, so that a refactor that renames a testid is a one-file edit and a mechanical find-replace.
16. As the refactor's author, I want explicit out-of-scope declarations in this PRD, so that the harness does not drift into screenshot regression / a11y audits / contract-drift detection over time.

## Implementation Decisions

### Architecture

- **Mock boundary: HTTP network.** MSW Node sidecar intercepts requests to Atlassian (`JIRA_BASE_URL`) and GitLab (`GITLAB_API_BASE_URL`). The app boots unchanged. See `docs/adr/0001-mock-at-network-boundary-for-e2e.md`.
- **App runtime: built TanStack Start server.** `pnpm build` once per run; built server is started by Playwright's `webServer` config. One app process for the whole run.
- **Parallelism: sequential (`workers: 1`).** The MSW sidecar and the World are module-level state in the Playwright runner process; per-test isolation is achieved by resetting the World before each spec, not by per-worker boots. Per-worker isolation is a future move if total runtime grows past ~5 minutes.
- **No CI integration.** The harness runs locally before pushing a refactor. clashboard is a local-only app per the parent PRD; CI would carry cost without proportional value.

### MSW sidecar

- Started in Playwright `globalSetup`. Listens on `127.0.0.1:9999`. Two route prefixes:
  - `/jira/rest/api/3/*` — Atlassian API surface (search, issue, transitions, myself).
  - `/gitlab/api/v4/*` — GitLab API surface (merge_requests, discussions, approvals, reviewers, user).
- Handlers are thin: parse params, dispatch to the World, serialise via factories. No business logic in handlers.
- One-shot overrides registered via `mocks.failNext('POST /issue/:key/transitions', { status: 400, body: ... })` apply to the next matching request and revert.
- 401 responses are produced explicitly by overrides; the default world never returns 401.

### The World

- A `tests/e2e/world/World.ts` class wraps in-memory state: issues, transitions allowed per issue, MRs (with discussions, approvals, reviewers), the current Jira and GitLab user.
- Public methods: `seedIssues`, `seedMrs`, `seedReviewers`, `seedTransitions`, `getIssue`, `searchIssues` (covering both the board JQL and `key in (...)` bulk fetch), `getTransitions`, `transitionIssue`, `getMr`, `getMrDiscussions`, `getMrApprovals`, `getMrReviewers`, `getMyself`, `getGitlabCurrentUser`.
- Mutations are visible on subsequent reads. Refetch-after-mutation flows work without choreography.
- `seedBaselineWorld()` returns a curated default — ~8 issues covering each Jira status × type × column combination plus ~4 MRs covering each review-state bucket. Most specs start from this and override.
- Per-test fixture rebuilds the World fresh. No state leaks across specs.

### Fixtures and factories

- Handcrafted only. No captured/replayed responses checked in.
- Factories live in `tests/e2e/fixtures/`:
  - `makeIssue(overrides)` → Jira issue JSON with required fields (`fields.summary`, `fields.status`, `fields.issuetype`, `fields.labels`, `fields.assignee`, `fields.reporter`, `fields.priority`, `fields.parent`, `fields.subtasks`, `fields.issuelinks`, `fields.description` ADF).
  - `makeMr(overrides)`, `makeMrReviewer(overrides)`, `makeDiscussion(overrides)`, `makeApprovals(overrides)`, `makePipeline(overrides)`.
  - `makeUser(overrides)` for both Atlassian and GitLab user shapes.
- Synthetic content only. Tickets read like `HDR-100: Lorem placeholder` — never real Hexagon/HDR ticket strings.
- Fixture diffs in PRs read as "this test added a ticket with status `Reviewed` and label `Frontend`", not as 200 fields of API noise.

### Time and animations

- **Browser clock: pinned via Playwright `page.clock`.** Installed at `beforeEach`, set to `2026-05-08T12:00:00Z`. Tests fast-forward via `page.clock.fastForward('60s')` to step polls.
- **Server clock: not pinned.** The JQL builder is unit-tested in Vitest; the mock returns the test's seeded world regardless of JQL time clauses.
- **Animations: disabled in test mode** via a CSS guard keyed on a query-string flag (or a test cookie). Tests assert post-state ("the card is now in Done"), never animation timing.
- **Visibility / focus events: dispatched directly** via `page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))`. No physical tab blur required.

### Selectors and testids

- **Default: roles + accessible names.** `getByRole('button', { name: /Open in Jira/i })`, `getByRole('dialog')`, `getByRole('status')` for toasts.
- **Fallback: `data-testid` centralised in `src/lib/testids.ts`.** Components reference `testIds.statusPill` rather than a string literal. Tests import the same module.
- **Cards carry `data-testid="ticket-card"` and `data-issue-key="<KEY>"`.** Other testids: `status-pill`, `type-icon`, `label-dot`, `sync-indicator`, `refresh-button`, `detail-panel`, `mr-section`, `reviewer-avatar`, `unresolved-thread-chip`, `ci-indicator`, `fixasap-ribbon`. Add testids only as specs need them; not preemptively.
- **Never use structural CSS selectors** (`.card .pill button`). A test that does is broken.
- **Discipline:** an aria-label or accessible name is preferred over a testid even when both work. Testids are the escape hatch, not the default.

### Spec taxonomy and organisation

- ~35 specs total, scenario-level. One spec = one user-visible flow walked end to end. User stories are not 1:1 with specs and breadcrumb comments are not added.
- Layout under `tests/e2e/`:
  - `smoke.spec.ts` — boots, board renders, panel opens.
  - `board/` — column mapping, polling, visibility pause, search, sync indicator.
  - `ticket-card/` — click semantics, label dots, change-pulse.
  - `status-pill/` — transition happy path, transition failure.
  - `ticket-detail/` — panel open/close (URL param, Esc, browser back), navigation (J/K/arrows), linked-issues cross-JQL fetch, ADF rendering, keyboard shortcuts (O, C).
  - `mr-status/` — author-mode reviewer row, CI indicator, unresolved threads, warning rows.
  - `review-cards/` — lane placement, fake-card fallback, non-interactive pill, lazy-load gating.
  - `auth-status/` — Jira 401 full-screen, GitLab 401 one-time toast.
- Folder names mirror `src/features/*`. A refactor that splits a feature folder rebalances tests with it.
- Each spec seeds its World in setup, exercises one flow, asserts on user-visible state. No `beforeAll` shared seeds across tests.

### Tooling and lifecycle

- `@playwright/test` + `msw` + `@mswjs/data` (optional, for the World) as devDependencies.
- `playwright.config.ts` declares:
  - `webServer.command = 'pnpm build && <built-server-start>'`
  - `webServer.url = 'http://127.0.0.1:3000'`
  - `webServer.reuseExistingServer = !process.env.CI` (kept for symmetry; CI is not actually configured)
  - `globalSetup` starts MSW; `globalTeardown` closes it.
  - `workers: 1`.
  - `use.baseURL`, `use.testIdAttribute = 'data-testid'`, `use.locale = 'en-US'`, `use.timezoneId = 'UTC'`.
- Scripts: `pnpm test:e2e` (run once), `pnpm test:e2e:ui` (Playwright UI mode for iteration).
- `tsconfig.json` excludes `tests/e2e/` from the main project; a `tests/e2e/tsconfig.json` extends with `@playwright/test` types.
- `.gitignore` adds `playwright-report/`, `test-results/`, `playwright/.cache/`.

## Testing Decisions

### What this harness covers

- React composition behaviour (component wiring, prop plumbing, slot rendering across the card / panel / MR section).
- TanStack Query orchestration (gating, lazy loading, invalidation rules, refetch-after-mutation).
- TanStack Router URL state (panel `?issue=KEY`, browser back/forward).
- Server-function plumbing (signatures, serialisation, error propagation).
- HTTP error mapping (401 → toast / full-screen, 5xx → banner with last-good data).
- Polling lifecycle (visibility pause, focus refetch, manual refresh fan-out).
- Optimistic update + rollback on failure.
- Keyboard shortcut wiring (`Cmd+K`, `Esc`, `J`/`K`, `O`, `C`).

### What this harness does not cover

- **Pure-module unit coverage.** Stays in Vitest. JQL builder, status mapping, sort tier order, review-state mapping, ADF node rendering edge cases, hash-color determinism, search filter, transition resolver, view-model derivation, and any new pure module the refactor introduces.
- **Visual / pixel regression.** No screenshot comparison.
- **Animation correctness.** Animations are disabled in test mode.
- **Real Atlassian/GitLab API contract drift.** Manual verification against real Jira/GitLab remains the source of truth for contract changes.
- **Performance, load, memory.**
- **Cross-browser.** Chromium only.
- **Accessibility audits.**
- **Dependency / package upgrade smoke.**

### Layered model post-harness

- **Vitest:** every pure module, every domain rule. Bulk of test count.
- **Playwright e2e:** ~35 scenario specs covering composition + full-stack plumbing.
- **Manual verification:** visual fidelity, animation timing, real-API contract drift.

## Out of Scope

- CI integration. Harness is local-only, mirroring the parent app's positioning.
- Visual regression / screenshot diffing.
- Accessibility audits via axe or equivalent.
- Cross-browser coverage (Firefox, WebKit).
- Per-user-story specs / breadcrumb comments mapping specs back to user-story numbers.
- Captured / replayed real API responses as fixtures.
- Per-worker isolation (deferred until total runtime warrants it).
- A test-only mode that bypasses the network boundary (e.g. mocking server functions directly). Explicitly rejected — see ADR 0001.
- Real authentication flows. Tests use dummy tokens; the MSW sidecar accepts any Authorization header.
- Server-time pinning. Server clock runs free; the JQL builder is unit-tested separately.
- Animations exercised in tests. Disabled in test mode.
- Accessibility of the harness's own DOM additions. The testid attributes and the test-mode CSS guard are non-rendering.

## Further Notes

- The harness's value compounds with the refactor, not before it. Until source modules start moving, the existing manual-verification habit covers the same ground at lower cost.
- Fixture factories double as a documented contract: "these are the fields clashboard reads from Atlassian/GitLab". A future contributor can read `tests/e2e/fixtures/` and learn the data shape without spelunking through `server/jira` and `server/gitlab`.
- The World is a 200–400-line piece of code that we own. It is part of the harness's deliberate architectural shape, not incidental. If the World grows past ~600 lines or develops feature-specific quirks, that is a signal to split it (e.g. `JiraWorld` and `GitLabWorld`) — not to revert to per-test handler scripts.
- The `data-testid` constants module (`src/lib/testids.ts`) is a public surface even though it serves tests. Tests grep it; components import it. A refactor that introduces a new testid does so in one place.
- The harness intentionally does not test contract drift with Atlassian/GitLab. That trade is what makes it refactor-immune. The day Atlassian renames a field, the running app breaks and the harness passes — the manual verification habit catches it.

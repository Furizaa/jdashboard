# E2E harness

Playwright runs the production build of the app against a Mock Service Worker
(MSW) sidecar. The sidecar is a real HTTP listener on `127.0.0.1:9999`; the
built server's `JIRA_BASE_URL` and `GITLAB_BASE_URL` are overridden to point
at it, so every Atlassian and GitLab call funnels through MSW handlers.

No real upstream traffic ever leaves your machine during a run.

## Prerequisites

A `.env` at the repo root with the keys listed in `.env.example`. The values
don't need to be real — they only need to pass the boot-time
`getServerEnv()` validation. Playwright's `webServer.env` overrides
`JIRA_BASE_URL` and `GITLAB_BASE_URL` at runtime.

## Run

```sh
pnpm test:e2e        # build, start the prod server, run all specs
pnpm test:e2e:ui     # same, in Playwright UI mode
```

Playwright's `webServer` builds the app (`vite build`) and starts the
production server via `srvx`. The MSW sidecar is started by an `auto`
worker-scoped fixture so it lives in the same Node process as the tests;
that's what lets `world.seedIssues(...)` mutations be visible to the HTTP
listener. `workers: 1` keeps the per-test World deterministic.

## Layout

```
tests/e2e/
  fixtures/
    test.ts          ← Playwright `test` extended with `world` and `mocks`
    factories.ts     ← makeIssue, makeUser — synthetic Atlassian-shaped JSON
  mocks/
    handlers.ts      ← MSW http handlers, dispatch into the World
    server.ts        ← Node http listener invoking handlers via msw's getResponse
  world/
    World.ts         ← seedIssues, searchIssues, getMyself, seedBaselineWorld
  smoke.spec.ts      ← end-to-end tracer-bullet
  README.md          ← this file
  tsconfig.json      ← extends root, adds @playwright/test types
```

## How the layers compose

1. **World** holds the per-test state (issues, current user). Each spec gets a
   fresh `World` from the `world` fixture.
2. **Factories** produce raw Atlassian-shaped JSON. Use them whenever you need
   an issue or a user — they keep IDs unique and shapes correct.
3. **Handlers** are MSW `http.get/post` resolvers that read from the World
   (via `getWorld()`) and serialise responses through the factories.
4. **Server** translates incoming Node `http` requests into fetch `Request`
   objects, calls `getResponse(handlers, request)`, and writes the response
   back. Per-test overrides via `mocks.use(...)` take precedence.
5. **Specs** use `page.getByRole(...)` / accessible names where possible;
   fall back to `data-testid` (registered in `src/lib/testids.ts`) only when
   no semantic selector exists.

## Adding a spec

1. Decide what the user-visible behaviour is. Write the assertion first.
2. If the spec needs new World state, extend `World.ts`.
3. If it needs new factory shapes, extend `factories.ts`.
4. If it needs new endpoints, add MSW handlers in `handlers.ts`.
5. If it needs a transient response, register it inside the spec via
   `mocks.use(http.get(..., ...))`.

## Failing a single request: `mocks.failNext`

Register a one-shot override that fires for the next matching request and is
then dropped — subsequent requests fall through to the default world-backed
handlers. Use it to assert error-handling paths without leaving stub state
behind for the rest of the test.

```ts
mocks.failNext('POST', '*/rest/api/3/issue/HDR-1/transitions', {
  status: 400,
  body: { errorMessages: ['Workflow violation'] },
})
```

Pass `delayMs` to hold the response open long enough to observe an in-flight
UI state — for example, an optimistic update that should be rolled back when
the failure lands:

```ts
mocks.failNext('POST', '*/rest/api/3/issue/HDR-1/transitions', {
  status: 400,
  body: { errorMessages: ['Workflow violation'] },
  delayMs: 400,
})
```

After the override fires, repeating the action exercises the default handler
and is the cleanest way to prove the override was a one-shot.

## Selector preference

Prefer `page.getByRole(...)` and accessible names. Reach for testids
(via `testIds` in `src/lib/testids.ts`) only as a last resort. Every new
testid lives in that file — no string literals in component code.

## Vitest separation

Vitest's `include` pattern is `src/**/*.{test,spec}.{ts,tsx}`, so files under
`tests/` are never picked up by `pnpm test`. The e2e tsconfig is separate
from the root one; `pnpm typecheck` checks both.

## Determinism

- `page.clock.install` pins the browser clock to `2026-05-08T12:00:00Z`.
- `use.timezoneId = 'UTC'`.
- The animation guard (`?e2e=1` flag) zeroes out CSS transitions and animations.
- `workers: 1` so the shared MSW sidecar's per-test state stays consistent.

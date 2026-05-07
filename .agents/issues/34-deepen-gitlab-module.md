# 34 — Deepen `src/server/gitlab/` behind a `GitlabGateway` port

**Type:** AFK

## Parent

Architecture refactor — no parent PRD. Same shape as [33-deepen-jira-module](./33-deepen-jira-module.md), smaller surface. Issue 33 explicitly carved this out: "The same refactor for `src/server/gitlab/`. Same shape, smaller surface — separate issue." This is that issue.

## Background

The current shape of `src/server/gitlab/`:

- `src/server/gitlab/client.ts` (153 LOC) — module-scoped `gitlabClient` singleton with `getCurrentUser`, `listMrs`, `getMr`, `getMrDiscussions`, `getMrApprovals`. Module-scoped `cachedCurrentUser`. Throws `GitlabAuthError` and `GitlabHttpError`. No tests. Both error classes are re-exported from `index.ts` and caught in `server-functions.ts`.
- `src/server/gitlab/server-functions.ts` (73 LOC) — `getGitlabUser` and `getMrStatuses`. `getMrStatuses` hand-rolls the entire flow inline: `getCurrentUser()` → compute `updatedAfter` from `JIRA_DONE_WINDOW_DAYS` → `listMrs({ states: ['opened','merged'], … })` → `buildMrKeyMap` → for each matched key, fan out three parallel calls (`getMr` + `getMrDiscussions` + `getMrApprovals`) → build `approvedUsernames` Set → `summarizeMr` → fold into `Record<string, MrSummary>`. Surrounded by a `try { … } catch (GitlabAuthError) { ok: false, reason: 'unauthorized' }` block. No tests.
- `src/server/gitlab/mr-status.ts` — pure `summarizeMr` producing the `MrSummary` discriminated union. Tested via `mr-status.test.ts`. Imports from `~/features/mr-status/{ci-state, count-unresolved, reviewer-state}` — a server module pulling from a feature folder.
- `src/server/gitlab/mr-key-map.ts` — pure `buildMrKeyMap` and `extractKeysFromTitle`. Tested via `mr-key-map.test.ts`.

Real bugs hide in the same seam issue 33 already addressed for Jira: the orchestration in `getMrStatuses` (date-window math, fan-out fan-in across three endpoints per key, error-funneling, `Record` folding) has zero tests because there is no port to inject a fake. Pure helpers (`summarizeMr`, `buildMrKeyMap`) are tested in isolation; the wiring that puts them together is invisible. Partial-failure paths (a per-MR call returning 404, a single approvals fetch throwing, an MR with no Jira-key match in its title, dedup-by-newest when two MRs share a key) are unreachable from a test today.

The error contract is also inconsistent with Jira post-#33. Jira returns `JiraResult<T>` (a discriminated union with `unauthorized` / `not-found` / `rejected`); GitLab uses `try { … } catch (GitlabAuthError)` and lets every other error escape as a generic 500. Two integrations, two error contracts.

The goal: collapse the cluster behind a `GitlabGateway` port and a `GitlabMrService` domain layer, mirroring the Jira shape exactly so the parallel is obvious. The hot path stays a zero-argument call (`service.getMrStatuses()`); all config (`jiraProjectKey`, `lookbackDays`, `defaultStates`, `clock`) is absorbed at construction. New callers get new methods added additively; the existing two never grow extra parameters.

## What to build

Three internal layers behind an unchanged public surface:

1. **`GitlabGateway` port** — resource-grained interface, one method per GitLab API operation the app performs. Returns `GitlabResult<T>` (discriminated union: `unauthorized` / `not-found` / `rejected` / `ok`) so callers never see thrown HTTP errors. `GitlabAuthError` and `GitlabHttpError` do not cross the port boundary. The adapter normalises GitLab's snake_case wire fields (`web_url`, `updated_at`, `head_pipeline.status`, `has_conflicts`, `approved_by[].user.username`) into camelCase `Raw*` shapes so the service never sees raw API noise.

2. **`HttpGitlabGateway` adapter** — production implementation. Owns `fetch`, `PRIVATE-TOKEN` header construction, project-path encoding, request helper, and the single try/catch that maps `GitlabAuthError → { ok: false, reason: 'unauthorized' }`, 404 → `{ ok: false, reason: 'not-found' }`, other non-2xx → `{ ok: false, reason: 'rejected', message: … }`.

3. **`GitlabMrService`** — domain layer. Consumes the port; emits view-model types. Owns: lookback-window math via injected `clock`, `getCurrentUser` → `authorUsername` plumbing, `buildMrKeyMap` invocation, per-key fan-out across `getMr` / `getMrDiscussions` / `getMrApprovals`, `approvedUsernames` Set construction, `summarizeMr` invocation, and the `Record<string, MrSummary>` fold.

The 2 server functions become 1-line wrappers: one `service.method()` call + return.

### Concrete file changes

- **New** `src/server/gitlab/gateway.ts` — defines `GitlabGateway` interface, `GitlabResult<T>`, and the `Raw*` wire types (`GatewayUser`, `RawMrSummary`, `RawMrDetail`, `RawReviewer`, `RawDiscussion`, `RawNote`, `RawApprovals`, `ListMrsQuery`). No HTTP types leak through this file.
- **New** `src/server/gitlab/http-gateway.ts` — `createHttpGitlabGateway(deps: { baseUrl, token, projectPath, fetch? }): GitlabGateway`. Replaces `client.ts`. Merges the request helper, `PRIVATE-TOKEN` header, project-path encoding, error catching, and per-method implementations. `GitlabAuthError` and `GitlabHttpError` move here as adapter-private classes — no longer exported.
- **New** `src/server/gitlab/mr-service.ts` — `createGitlabMrService(gateway: GitlabGateway, config: GitlabMrServiceConfig): GitlabMrService`. Service interface:
  - `getCurrentUser()` — pass-through with view-model shape `{ username, displayName }`.
  - `getMrStatuses()` — zero-argument; owns the full orchestration (lookback math, listMrs, key-map, fan-out, summarise, fold).

  Config shape:
  ```ts
  type GitlabMrServiceConfig = {
    jiraProjectKey: string
    lookbackDays: number
    defaultStates: ReadonlyArray<'opened' | 'merged'>
    clock: () => Date
  }
  ```
  The injected `clock` makes the lookback window deterministic in tests.

- **Delete** `src/server/gitlab/client.ts` — folded into `http-gateway.ts`. The module-scoped `cachedCurrentUser` is dropped: in production the service is a module-level singleton, so the gateway adapter can be stateless. The service does the `getCurrentUser` call exactly once per `getMrStatuses` invocation regardless.
- **Keep** `src/server/gitlab/mr-status.ts` — `summarizeMr` is pure and stays. Updated to consume the new `Raw*` types from `gateway.ts` instead of `GitlabMrDetail` / `GitlabDiscussion` from `client.ts`. Still imports from `~/features/mr-status/*` for now; that dependency-arrow inversion is real but separate (flagged in Out of scope).
- **Keep** `src/server/gitlab/mr-key-map.ts` — pure helper, called only from `mr-service.ts`. Updated to type against the new `RawMrSummary` instead of `GitlabMrSummary`.
- **Rewrite** `src/server/gitlab/server-functions.ts` — each of the 2 `createServerFn` exports becomes a 1-line wrapper:
  ```ts
  export const getGitlabUser = createServerFn({ method: 'GET' }).handler(() =>
    service().getCurrentUser(),
  )
  export const getMrStatuses = createServerFn({ method: 'GET' }).handler(() =>
    service().getMrStatuses(),
  )
  ```
  All `try`/`catch` handling moves into the adapter. The inline orchestration is gone.
- **Rewrite** `src/server/gitlab/index.ts` — public surface shrinks to: the 2 server functions, the result-shape types each server function returns, and `MrSummary` / `MrReviewerState` (still consumed by the frontend). Removed from public surface: `gitlabClient`, `GitlabAuthError`, `GitlabHttpError`, all `Gitlab*` wire types (`GitlabUser`, `GitlabMrSummary`, `GitlabMrDetail`, `GitlabReviewer`, `GitlabDiscussion`, `GitlabNote`, `GitlabApprovals`, `ListMrsOptions`).

### Wiring at the composition root

```ts
// src/server/gitlab/server-functions.ts (top of file)
let cached: GitlabMrService | null = null

function service(): GitlabMrService {
  if (cached === null) {
    const env = getServerEnv()
    const gateway = createHttpGitlabGateway({
      baseUrl: env.GITLAB_BASE_URL,
      token: env.GITLAB_TOKEN,
      projectPath: env.GITLAB_PROJECT_PATH,
    })
    cached = createGitlabMrService(gateway, {
      jiraProjectKey: env.JIRA_PROJECT_KEY,
      lookbackDays: env.JIRA_DONE_WINDOW_DAYS,
      defaultStates: ['opened', 'merged'],
      clock: () => new Date(),
    })
  }
  return cached
}
```

Module-level singleton matches the `service()` accessor pattern already used in `src/server/jira/server-functions.ts` after #33. Tests build their own service via the same factory with a hand-rolled gateway and a fixed clock.

### Tests — replace, don't layer

- **Keep** `src/server/gitlab/mr-status.test.ts` — pure helper, still cheap and documents the contract.
- **Keep** `src/server/gitlab/mr-key-map.test.ts` — pure helper, still cheap and documents the contract.
- **Keep** the feature-side pure helper tests `src/features/mr-status/{ci-state.test.ts, count-unresolved.test.ts, reviewer-state.test.ts}`.
- **New** `src/server/gitlab/mr-service.test.ts` — exercises the service against a hand-rolled fake `GitlabGateway`. **No `vi.mock`. No `fetch` stub.** Helper:
  ```ts
  function fakeGateway(overrides: Partial<GitlabGateway>): GitlabGateway {
    const notImpl = () => {
      throw new Error('not used in this test')
    }
    return {
      getCurrentUser: notImpl,
      listMrs: notImpl,
      getMr: notImpl,
      getMrDiscussions: notImpl,
      getMrApprovals: notImpl,
      ...overrides,
    } as GitlabGateway
  }
  ```
  Coverage at minimum:
  - `getCurrentUser` propagates `unauthorized` from the gateway.
  - `getCurrentUser` returns the `{ username, displayName }` view-model on success.
  - `getMrStatuses` passes the configured `authorUsername` (from `getCurrentUser`), `defaultStates`, and a correctly-computed `updatedAfter` (`clock() − lookbackDays * 86_400_000`) to `listMrs`. Verified via a spy on the fake gateway.
  - `getMrStatuses` returns `{ ok: true, byKey: {} }` when no MR titles match `jiraProjectKey`.
  - `getMrStatuses` keeps the **newest** MR per Jira key when titles repeat (covers `buildMrKeyMap`'s dedup at the integration seam).
  - `getMrStatuses` does NOT call `getMr` / `getMrDiscussions` / `getMrApprovals` for losers in the dedup — fan-out runs only for the winning MR per key.
  - `getMrStatuses` shapes each kind end-to-end (`merged`, `draft`, `no-reviewers`, `review`): provide raw fixtures, assert the discriminated union the frontend consumes.
  - `getMrStatuses` propagates `unauthorized` when `getCurrentUser` returns it (no further calls made).
  - `getMrStatuses` propagates `unauthorized` when `listMrs` returns it.
  - `getMrStatuses` throws via an `unexpectedReason`-style helper when a per-MR fan-out call returns `not-found` or `rejected` (these are bugs, not user-facing states — same convention as Jira's `loadIssue` post-#33).
  - `getMrStatuses` builds `approvedUsernames` from `getMrApprovals` and passes it to `summarizeMr` correctly (fixture where one reviewer has approved and another has only commented produces the expected `review` shape).
- **Optional, recommended** `src/server/gitlab/http-gateway.test.ts` — thin adapter test using `vi.stubGlobal('fetch', …)`, pinning `PRIVATE-TOKEN` header construction, project-path URL encoding, 401 → `{ ok: false, reason: 'unauthorized' }` mapping, 404 → `{ ok: false, reason: 'not-found' }` mapping. One test per error mapping rule is enough.

### Caller migration

The 2 frontend callers continue to import the same server functions from `~/server/gitlab`:

- `src/features/mr-status/use-mr-statuses.ts` calls `getMrStatuses` and consumes `{ ok: true; byKey: Record<string, MrSummary> } | { ok: false; reason: 'unauthorized' }`.
- `src/features/header/GitlabIndicator.tsx` calls `getGitlabUser` and consumes `{ ok: true; username; displayName } | { ok: false; reason: 'unauthorized' }`.

Both result shapes are preserved verbatim. **Net change at frontend call sites: zero.**

## Acceptance criteria

- [ ] `GitlabGateway` port and `HttpGitlabGateway` adapter live in separate files. The port file (`gateway.ts`) does not import anything from `http-gateway.ts`.
- [ ] `GitlabAuthError` and `GitlabHttpError` are not exported from `src/server/gitlab/index.ts` and have zero references outside `src/server/gitlab/http-gateway.ts`.
- [ ] The `try { … } catch (GitlabAuthError) { … }` pattern appears in exactly one place (the adapter). `server-functions.ts` and `mr-service.ts` contain no `try`/`catch` blocks.
- [ ] `src/server/gitlab/server-functions.ts` is meaningfully shorter (target: < 30 LOC, down from 73). Each of the 2 server functions is a one-line wrapper over `service().<method>()`.
- [ ] `src/server/gitlab/index.ts` does not re-export `gitlabClient`, `GitlabAuthError`, `GitlabHttpError`, or any `Gitlab*` wire types (`GitlabUser`, `GitlabMrSummary`, `GitlabMrDetail`, `GitlabReviewer`, `GitlabDiscussion`, `GitlabNote`, `GitlabApprovals`, `ListMrsOptions`). Grep across `src/features/` confirms none of those symbols are imported.
- [ ] `MrSummary` and `MrReviewerState` remain exported from `index.ts` and continue to be consumed by `src/features/mr-status/use-mr-statuses.ts`.
- [ ] `src/server/gitlab/mr-service.test.ts` exists, uses a hand-rolled fake gateway, and contains no calls to `vi.mock` and no calls that stub `fetch`.
- [ ] The injected `clock` in `GitlabMrServiceConfig` is exercised in tests with a fixed `Date` so the lookback window assertion does not depend on wall-clock time.
- [ ] Both frontend caller files (`use-mr-statuses.ts`, `GitlabIndicator.tsx`) are unchanged.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

None. Independent of #33 (Jira deepening) — separate module, no shared types. Can land in either order.

## Out of scope

- Adding speculative service methods (`getMrStatusesIn(window)`, `getMrStatusForKey(key)`, drawer-by-iid, "MRs I'm reviewing" screen, webhook handler). These are natural *additive* extensions to the zero-argument `getMrStatuses()`, but no caller needs them today. Build them when a real consumer appears, not on speculation.
- Inverting the `src/server/gitlab/mr-status.ts` → `~/features/mr-status/*` import. The dependency arrow runs the wrong way (server depending on a feature folder), but fixing it means relocating pure helpers across the `src/server` ↔ `src/features` boundary — a separate cleanup.
- Promoting `defaultStates: ['opened', 'merged']` or `lookbackDays` to env vars beyond what `JIRA_DONE_WINDOW_DAYS` already provides. Constants stay in the composition root; env promotion is a future one-line change if needed.
- Touching the frontend cache-key registry, optimistic-update logic, or the status-pill module. Those are separate deepening candidates (surfaced in the architecture exploration but not committed).

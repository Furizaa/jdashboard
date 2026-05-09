# 66 — Effect server: Review context migration (GitLab gateway + cross-system orchestration)

**Type:** AFK

## Parent

[Effect server refactor PRD](../prds/effect-server-refactor.md)

## What to build

End-to-end migration of the **Review and MR-status server-side flows** into the new Effect-TS architecture, following the Board exemplar from slice 63. This slice introduces the **GitLab gateway** in the new layout and resolves the long-standing cross-namespace coupling smell — today's `server/gitlab/review-service.ts` imports `JiraIssueService` to drive `bulkLoadIssues`, smuggling cross-system orchestration inside the GitLab folder. After this slice, that orchestration lives in `server/contexts/review/application/get-review-cards.ts` depending on `JiraGateway` and `GitlabGateway` Tags as **peers**.

After this slice merges, the GitLab gateway is in the new layout; `getReviewCards` and `getMrStatuses` are Effect-based application services in their proper bounded contexts; the corresponding server functions are in `src/server/server-functions/`; pure GitLab-domain modules (`mr-key-map`, `mr-status`, and the `kernel/mr/*` MR review domain rules) co-locate with the GitLab gateway per Q14.3 (cross-context types live with their producer); old `src/server/gitlab/*` continues to exist but unused, ready for lockdown 67.

Concretely:

- **GitLab gateway** in `src/server/gateways/gitlab/`:
  - `port.ts` — `class GitlabGateway extends Context.Tag("GitlabGateway")<GitlabGateway, GitlabGatewayShape>() {}` with all 6 methods (`getCurrentUser`, `listMrs`, `getMr`, `getMrDiscussions`, `getMrApprovals`, `getMrReviewers`).
  - `types.ts` — gateway-output types: `GatewayUser`, `RawMrSummary`, `RawMrDetail`, `RawDiscussion`, `RawApprovals`, `RawMrReviewerWithState`, `ReviewerEndpointState`, `MrSummary`, `ReviewCard*` (the cards exposed via `getReviewCards`), and the MR-state types currently in `~/kernel/mr/` (`CiVisualState`, `MrState`, `ReviewerApprovalStatus`, `ReviewerVisualState`).
  - `errors.ts` — `Schema.TaggedError` classes: `Unauthorized`, `NotFound`, `Rejected` (mirrors Jira's; tagged distinctly per gateway only if the wire mapping differs — same semantics, separate classes for type-level isolation).
  - `http-adapter.ts` — `GitlabGatewayLive: Layer<GitlabGateway, never, ServerEnv>` using `@effect/platform`'s `HttpClient`. Includes the 401 → `Unauthorized`, 404 → `NotFound`, other → `Rejected` mapping.
  - `http-adapter.test.ts` — `@effect/vitest` + `Layer.succeed(HttpClient.HttpClient, fakeClient)`.
  - **Pure modules co-located with the gateway** (gateway-output domain logic per Q14.3):
    - `mr-key-map.ts` — `git mv` from `server/gitlab/mr-key-map.ts`. Existing tests follow.
    - `mr-status.ts` — `git mv` from `server/gitlab/mr-status.ts`. Existing tests follow.
    - `mr/{ci-state, count-unresolved, review-state, reviewer-state}.ts` — `git mv` from `src/kernel/mr/*` to `src/server/gateways/gitlab/mr/`. These are GitLab-data domain rules (CI visual state, unresolved-count, review bucketing, reviewer visual state) currently mis-housed in client kernel because both client and server consumed them. Now: the **server's** Review and Board-MR-overlay contexts import them from `gateways/gitlab/mr/`; the **client's** `kernel/mr/index.ts` becomes a re-export from `~/server/gateways/gitlab/mr` (unchanged from the client's perspective via `~/kernel`).
- **`appLayer` extended** to merge `GitlabGatewayLive`.
- **Review context** in `src/server/contexts/review/`:
  - `config.ts` — `class ReviewConfig extends Context.Tag(...)<ReviewConfig, { jiraProjectKey: string; lookbackDays: number; clock: Clock.Clock }>() {}` plus `ReviewConfigLive`. **`clock` becomes Effect's built-in `Clock` service** (replaces today's `clock: () => new Date()` config field — the team-template's `Clock` lesson per ADR-0005's "Logger / Tracer / Clock as Effect services" theme).
  - `errors.ts` — `GetReviewCardsError = Schema.Union(Unauthorized)`.
  - `application/get-review-cards.ts` — `Effect<GetReviewCardsOk, GetReviewCardsE, JiraGateway | GitlabGateway | ReviewConfig | Clock>`. **Depends on both gateway Tags as peers.** The cross-namespace coupling that today lives inside `server/gitlab/review-service.ts` — `bulkLoadIssues` from Jira + the GitLab MR fan-out — is composed here via `Effect.gen`. Fan-outs cap concurrency at 5 per Q11.3: `Effect.all(candidates.map(fetchMrFanOut), { concurrency: 5 })`.
  - `application/get-review-cards.test.ts` — `@effect/vitest` + `Layer.succeed` for both gateways and `Layer.succeed(Clock, TestClock)` if needed for fixed-clock testing.
  - `application/__fixtures__/{fake-jira-gateway, fake-gitlab-gateway}.ts` — per-context hand-rolled fakes.
  - `domain/` — empty unless review-specific pure helpers are extracted; `mr-key-map`/`mr-status` live with the GitLab gateway, not here.
  - `CONTEXT.md` — short doc; explicitly notes "Review depends on both `JiraGateway` and `GitlabGateway` as peers — cross-system orchestration's structurally correct home, replacing the `gitlab/review-service.ts → JiraIssueService` smell."
- **MR-statuses on Board context.** Today's `getMrStatuses` (the MR overlay on Board) currently lives in `server/gitlab/mr-service.ts`. Migrate to:
  - `src/server/contexts/board/application/load-mr-statuses.ts` — `Effect<LoadMrStatusesOk, LoadMrStatusesE, GitlabGateway | BoardConfig | Clock>`. Reuses `mr-key-map` and `mr-status` from `gateways/gitlab/`. Concurrency-5 fan-out.
  - `src/server/contexts/board/application/load-mr-statuses.test.ts`.
  - This adds `GitlabGateway` to Board's dependencies — Board now imports both `JiraGateway` and `GitlabGateway` ports. That is fine: shared ports per gateway (Q10) lets contexts depend on whichever gateways their use-cases need.
- **Server functions:**
  - `src/server/server-functions/review.ts` — `getReviewCards`. Uses `appRuntime.runPromise(toWire(getReviewCards.pipe(Effect.provide(...)), GetReviewCardsError))`.
  - Add to existing `src/server/server-functions/board.ts` — `getMrStatuses`. (Or create `src/server/server-functions/mr-statuses.ts` if a separate file fits the team-template better.) **Also** `getGitlabUser` (today's `getCurrentUser`) — single-use auth check. Probably lives alongside `getReviewCards` in `server-functions/review.ts` (same gateway, same auth seam).
- **Route updates.** Routes/components that imported `getGitlabUser`, `getMrStatuses`, `getReviewCards` from `~/server/gitlab/server-functions` switch to the new paths.
- **Old code removed/preserved.** `src/server/gitlab/server-functions.ts` is deleted (its content is fully migrated). `src/server/gitlab/{gateway, http-gateway, mr-service, review-service, mr-key-map, mr-status}.ts` continue to exist but are orphaned — deleted in 67. Same for `src/server/jira/{gateway, http-gateway, issue-service, config}.ts` — fully orphaned now (Board+Detail+Capture+Review all migrated).
- **Client kernel re-exports updated.** `src/kernel/gitlab.ts` updates source path from `~/server/gitlab` to `~/server/gateways/gitlab`. `src/kernel/mr/index.ts` becomes a thin re-export from `~/server/gateways/gitlab/mr`. The client side of `~/kernel/...` stays import-stable.

## Acceptance criteria

- [ ] `src/server/gateways/gitlab/{port, types, errors, http-adapter, http-adapter.test}.ts` exist and are populated.
- [ ] `GitlabGateway` is a `Context.Tag` with the 6-method interface (signatures shape-equivalent to today's `GitlabGateway` interface, returning `Effect<A, E>`).
- [ ] `GitlabGatewayLive: Layer<GitlabGateway, never, ServerEnv>` builds the live HTTP adapter via `@effect/platform`'s `HttpClient`, with retry+timeout middleware applied via the `appLayer`.
- [ ] Pure modules co-located with the GitLab gateway: `mr-key-map.ts`, `mr-status.ts`, `mr/{ci-state, count-unresolved, review-state, reviewer-state}.ts`, all `git mv`'d from their current homes (`server/gitlab/` and `src/kernel/mr/`). Existing tests follow via `git mv` + import-path update; no semantic changes.
- [ ] `src/kernel/mr/index.ts` and `src/kernel/gitlab.ts` updated to re-export from `~/server/gateways/gitlab/...`. Client-side imports through `~/kernel` are unaffected.
- [ ] `src/server/contexts/review/{config, errors, application, CONTEXT.md}` exist and are populated.
- [ ] `application/get-review-cards.ts` depends on `JiraGateway`, `GitlabGateway`, `ReviewConfig`, and `Clock` (Effect's built-in service) as peers; the cross-namespace coupling (`gitlab/review-service.ts → JiraIssueService`) is gone.
- [ ] `application/get-review-cards.ts` uses `Effect.all(candidates.map(...), { concurrency: 5 })` for the MR detail/discussions/approvals/reviewers fan-out (per Q11.3).
- [ ] `src/server/contexts/board/application/load-mr-statuses.ts` exists and is populated; depends on `GitlabGateway`, `BoardConfig`, `Clock`. Concurrency-5 fan-out.
- [ ] Each new application module has a sibling `*.test.ts` using `@effect/vitest`'s `it.effect` + `Layer.succeed` for both gateways. `__fixtures__/` per context.
- [ ] `src/server/server-functions/review.ts` exports `getGitlabUser` and `getReviewCards`; the existing or new `server-functions/board.ts` (or a sibling) exports `getMrStatuses`. All handlers use `appRuntime.runPromise(toWire(...))`.
- [ ] `src/server/gitlab/server-functions.ts` deleted; `src/server/gitlab/{gateway, http-gateway, mr-service, review-service, mr-key-map, mr-status}.ts` orphaned (deletion in 67).
- [ ] All `if (!result.ok) { if (reason === '…') … }` ladders in the migrated Review/MR-status path are gone.
- [ ] No file under `src/server/contexts/review/` imports from `src/server/contexts/<other>/` (verified by `dependency-cruiser`).
- [ ] No file under `src/server/gateways/gitlab/http-adapter.ts` imports from `src/server/gateways/<other>/`.
- [ ] CONTEXT.md documents the cross-namespace-coupling resolution explicitly.
- [ ] GitLab discussions filter (`note.system === true`) is preserved in the migrated `count-unresolved` and review-state logic (per memory).
- [ ] HDR Jira status casing case-insensitive comparisons preserved if any of the migrated paths touch status names (per memory).
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test && pnpm test:e2e` all green.
- [ ] User-visible behaviour is identical (e2e is the gate).
- [ ] `docs/architecture.svg` regenerated and committed; the new `contexts/review → gateways/{jira,gitlab}` peer-edges are visible.

## Blocked by

- 63 — Effect server: Board context migration (Jira gateway + Board exemplar)

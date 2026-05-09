# 64 — Effect server: Detail context migration

**Type:** AFK

## Parent

[Effect server refactor PRD](../prds/effect-server-refactor.md)

## What to build

End-to-end migration of the **Detail server-side flow** into the new Effect-TS architecture, following the Board exemplar from slice 63. After this slice merges, Detail's three use-cases (`loadIssue`, `loadTransitions`, `performTransition`) are Effect-based application services in `src/server/contexts/detail/application/`; the corresponding server functions are in `src/server/server-functions/detail.ts`; the Jira gateway is **reused as-is** from slice 63 (no gateway changes); old `src/server/jira/issue-service.ts` continues to exist (now with three more orphaned methods) until lockdown 67.

Concretely:

- **Detail context** in `src/server/contexts/detail/`:
  - `config.ts` — `class DetailConfig extends Context.Tag(...)<DetailConfig, { baseUrl: string }>() {}` plus `DetailConfigLive: Layer<DetailConfig, never, ServerEnv>`. (Detail's config is small — just the base URL for wire responses.)
  - `errors.ts` — Detail's per-context error unions: `LoadIssueError = Schema.Union(Unauthorized, NotFound)`, `LoadTransitionsError = Schema.Union(Unauthorized, NotFound)`, `PerformTransitionError = Schema.Union(Unauthorized, Rejected)`.
  - `application/load-issue.ts` — `Effect<LoadIssueOk, LoadIssueE, JiraGateway | DetailConfig>`. Replaces the current `loadIssue` method on `JiraIssueService` (Promise.all over `getIssue` + `searchIssues` for sub-issues; field mapping; comment mapping; `priority.name === "Undefined"` sentinel handling per memory).
  - `application/load-transitions.ts` — `Effect<LoadTransitionsOk, LoadTransitionsE, JiraGateway>`.
  - `application/perform-transition.ts` — `Effect<PerformTransitionOk, PerformTransitionE, JiraGateway>`. Note the existing oddity that the old `performTransition` translates `not-found` to `rejected` — preserve that behaviour or surface a deliberate change in the PR description.
  - Each `application/*.ts` has a sibling `*.test.ts` using `@effect/vitest` + `Layer.succeed(JiraGateway, fake)`. Fakes live in `application/__fixtures__/fake-jira-gateway.ts` (per-context hand-rolled, even if similar to Board's — the rule is per-context fakes).
  - `domain/` — empty unless any pure helpers from `issue-service.ts` (e.g. `toLinkedRef`, `plainTextToAdf` if used by Detail) are extracted; if extracted, they live in `gateways/jira/` since they are gateway-output mapping logic. Detail's `domain/` stays empty in this slice.
  - `CONTEXT.md` — short, focused per-context doc.
- **Server functions** in `src/server/server-functions/detail.ts`:
  - `getIssue`, `getTransitions`, `transitionIssue` handlers, each calling `appRuntime.runPromise(toWire(program, ErrorSchema))`. The existing `inputValidator` for `key` / `transitionId` shape stays (today's hand-rolled `requireKey` helper) — or migrate to a tiny Schema decoder if simpler.
- **Route updates.** Routes/components that imported `getIssue`, `getTransitions`, `transitionIssue` from `~/server/jira/server-functions` switch to `~/server/server-functions/detail`.
- **Old code preserved.** `src/server/jira/server-functions.ts` loses these three handler exports; `JiraIssueService.{loadIssue, loadTransitions, performTransition}` become orphaned methods. Not deleted until 67.

## Acceptance criteria

- [ ] `src/server/contexts/detail/{config, errors, application, CONTEXT.md}` exist and are populated.
- [ ] `application/{load-issue, load-transitions, perform-transition}.ts` each export an `Effect<...>` program with the appropriate `R` channel (`JiraGateway` for all; `DetailConfig` for `load-issue`).
- [ ] Each application module has a sibling `*.test.ts` using `@effect/vitest`'s `it.effect` and hand-rolled fakes via `Layer.succeed`. Both success paths and tagged-error paths asserted.
- [ ] `application/__fixtures__/fake-jira-gateway.ts` is a hand-rolled per-context fake (no `vi.mock`).
- [ ] `src/server/server-functions/detail.ts` exports `getIssue`, `getTransitions`, `transitionIssue`; each handler uses `appRuntime.runPromise(toWire(...))`.
- [ ] `src/server/jira/server-functions.ts` no longer exports `getIssue`, `getTransitions`, `transitionIssue`. Route/component imports updated.
- [ ] `JiraIssueService.{loadIssue, loadTransitions, performTransition}` are orphaned but not deleted (lockdown removes them in 67).
- [ ] All `if (!result.ok) { if (reason === '…') … }` ladders in the migrated Detail path are gone (replaced by `Effect.catchTag` / `Effect.matchTags`).
- [ ] No file under `src/server/contexts/detail/` imports from `src/server/contexts/<other>/`, from `react`, `@tanstack/react-*`, `sonner`, `window`, `document` (verified by `dependency-cruiser`).
- [ ] HDR Jira priority-`"Undefined"` sentinel handling is preserved in the migrated `load-issue` (per memory).
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test && pnpm test:e2e` all green.
- [ ] User-visible behaviour is identical (e2e is the gate).
- [ ] `docs/architecture.svg` regenerated and committed.

## Blocked by

- 63 — Effect server: Board context migration (Jira gateway + Board exemplar)

# 33 — Deepen `src/server/jira/` behind a `JiraGateway` port

**Type:** AFK

## Parent

Architecture refactor — no parent PRD. Motivated by an exploration of architectural friction in `src/server/jira/`: shallow utilities (each separately exported and exhaustively unit-tested) wrap an untested 400-LOC orchestration layer (`server-functions.ts`) that contains the real composition logic and the bugs that would actually hurt in production.

## Background

The current shape:

- `src/server/jira/client.ts` (204 LOC) — substantive HTTP wrapper. No tests.
- `src/server/jira/server-functions.ts` (400 LOC) — 7 `createServerFn`-wrapped operations (`getMyself`, `searchIssues`, `getIssue`, `getTransitions`, `transitionIssue`, `createIssue`, `getMyEpics`). Each repeats the same `try { … } catch (JiraAuthError) { ok: false, reason: 'unauthorized' } catch (JiraHttpError 404) { ok: false, reason: 'not-found' }` pattern (~250 LOC of duplication across the 7 functions). Inline helpers `toLinkedRef` and `parseJiraErrorMessage`. No tests.
- `src/server/jira/jql.ts`, `epic-jql.ts`, `plain-text-to-adf.ts`, `quick-create-payload.ts`, `quick-create-schema.ts` — small utilities, all individually re-exported from `index.ts`, each with a paired `*.test.ts` (test/code ratios 200–500%).

Real bugs hide in the seams: the `getMyself`-then-`createIssue` sequencing in `createIssue`, the JQL + label-filter + pagination + response-transform chain in `searchIssues`, the main-issue + sub-issue fetch + `toLinkedRef` chain in `getIssue`. None of those compositions are tested today. Hardcoded values (`[FE]:` summary prefix, `Frontend` label, `Lowest` priority in `quick-create-payload.ts`; `status = "In Progress"` in `epic-jql.ts`) are scattered across the utility files that consume them, so the next change to any of them is a code change in a file other than the operation that uses it.

The goal: collapse the cluster behind a `JiraGateway` port and a `JiraIssueService` domain layer so orchestration is testable against a hand-rolled fake (no `vi.mock`, no `fetch` stubbing), error mapping lives in one place, and config sits next to the operation that consumes it.

## What to build

Three internal layers behind an unchanged public surface:

1. **`JiraGateway` port** — resource-grained interface. One method per Jira API operation the app performs. Returns `JiraResult<T>` (discriminated union) so callers never see thrown HTTP errors; `JiraAuthError` and `JiraHttpError` do not cross the port boundary. View-model types directly for pass-through operations; `Raw*` wire types only for the operations that meaningfully transform (`searchIssues`, `getIssue`'s detail expansion, `createIssue`'s payload).

2. **`HttpJiraGateway` adapter** — production implementation. Owns `fetch`, basic-auth header construction, request helper, and the single try/catch that maps `JiraAuthError → { ok: false, reason: 'unauthorized' }` and `JiraHttpError 404 → { ok: false, reason: 'not-found' }`. The 7× duplicated try/catch in today's `server-functions.ts` collapses into this one place.

3. **`JiraIssueService`** — domain layer. Consumes the port; emits view-model types. Owns: JQL building, label filtering, response shaping, the `getMyself`-then-create chain in `quickCreate`, sub-issue fetch + `toLinkedRef` in `loadIssue`. Hardcoded constants move into a `QuickCreateConfig` / `EpicConfig` value passed to the service factory.

The 7 server functions become 3-line wrappers: validator + one `service.method(input)` call + return.

### Concrete file changes

- **New** `src/server/jira/gateway.ts` — defines `JiraGateway` interface, `JiraResult<T>`, and the small number of `Raw*` wire types that the gateway returns for transform-heavy operations. No HTTP types leak through this file.
- **New** `src/server/jira/http-gateway.ts` — `createHttpJiraGateway(deps: { baseUrl, email, apiToken, fetch? }): JiraGateway`. Replaces `client.ts`. Merges request helper, basic-auth header, error catching, and per-method implementations. `JiraAuthError` and `JiraHttpError` move here as adapter-private classes — no longer exported.
- **New** `src/server/jira/issue-service.ts` — `createJiraIssueService(gateway: JiraGateway, config: JiraServiceConfig): JiraIssueService`. Service methods:
  - `getMyself()` — pass-through with view-model shape.
  - `loadBoard()` — owns `buildBoardJql` + the imperative label filter loop currently in `server-functions.ts`.
  - `loadIssue(key)` — owns main fetch + sub-issue fetch + `toLinkedRef`.
  - `loadTransitions(key)` — pass-through.
  - `performTransition(key, id)` — pass-through.
  - `quickCreate(input)` — owns `getMyself` chain + `buildCreatePayload` + `createIssue`.
  - `loadMyEpics()` — owns `buildEpicJql`. The `"In Progress"` literal becomes a field on `EpicConfig`, not a constant inside the JQL builder.
- **New** `src/server/jira/config.ts` — `defaultQuickCreateConfig` (`summaryPrefix: '[FE]: '`, `labels: ['Frontend']`, `priority: 'Lowest'`) and `defaultEpicConfig` (`statuses: ['In Progress']`). Not env-configurable yet; promoting to env is a future one-line change.
- **Delete** `src/server/jira/client.ts` — folded into `http-gateway.ts`.
- **Delete** `src/server/jira/jql.ts` and `src/server/jira/epic-jql.ts` — folded into `issue-service.ts` as private helpers (or a sibling `internal/jql.ts` if the file gets too long).
- **Delete** `src/server/jira/quick-create-payload.ts` — folded into `issue-service.ts`.
- **Delete** `src/server/jira/plain-text-to-adf.ts` — folded into `issue-service.ts`.
- **Keep** `src/server/jira/quick-create-schema.ts` — frontend `QuickCreateForm.tsx` imports `quickCreateSchema` for client-side validation, so it can't collapse into server-only code.
- **Rewrite** `src/server/jira/server-functions.ts` — each of the 7 `createServerFn` exports becomes a 3-line wrapper:
  ```ts
  export const createIssue = createServerFn({ method: 'POST' })
    .validator(quickCreateSchema)
    .handler(async ({ data }) => service.quickCreate(data));
  ```
  The `parseJiraErrorMessage` helper moves into the adapter (it parses HTTP error bodies). `toLinkedRef` moves into the service (it shapes domain types).
- **Rewrite** `src/server/jira/index.ts` — public surface shrinks to: the 7 server functions, view-model types (`BoardIssue`, `DetailIssue`, `AllowedTransition`, `EpicRef`, `AdfNode`, plus the result-shape types each server function returns), `quickCreateSchema`, `QuickCreateInput`. Removed from public surface: `jiraClient`, `JiraAuthError`, `JiraHttpError`, the `Jira*` wire types (`JiraIssue`, `JiraDetailedIssue`, `JiraTransition`, `JiraCreateIssueBody`, `JiraSearchResponse`, `JiraTransitionsResponse`, `JiraCreateIssueResponse`, `JiraMyself`), `buildBoardJql`, `buildEpicJql`, `buildCreatePayload`, `plainTextToAdf`, `BoardJqlConfig`.

### Wiring at the composition root

```ts
// src/server/jira/server-functions.ts (top of file)
const env = getServerEnv();
const gateway = createHttpJiraGateway({
  baseUrl: env.JIRA_BASE_URL,
  email: env.JIRA_USERNAME,
  apiToken: env.JIRA_API_TOKEN,
});
const service = createJiraIssueService(gateway, {
  projectKey: env.JIRA_PROJECT_KEY,
  labelFilter: env.JIRA_LABEL_FILTER,
  hideLabels: env.JIRA_HIDE_LABELS,
  doneWindowDays: env.JIRA_DONE_WINDOW_DAYS,
  quickCreate: defaultQuickCreateConfig,
  epic: defaultEpicConfig,
});
```

Module-level singleton matches the existing "modules exported directly" idiom — no DI framework. Tests build their own service via the same factory with a hand-rolled gateway.

### Tests — replace, don't layer

- **Delete** `src/server/jira/jql.test.ts`, `epic-jql.test.ts`, `plain-text-to-adf.test.ts`, `quick-create-payload.test.ts`. The behaviors they cover (JQL escaping, ADF shape, payload field assembly, `[FE]:` prefix) are now exercised through `issue-service.test.ts` at the boundary that callers actually go through.
- **Keep** `src/server/jira/quick-create-schema.test.ts` — the schema is also imported standalone by the frontend.
- **New** `src/server/jira/issue-service.test.ts` — exercises the service against a hand-rolled fake `JiraGateway`. **No `vi.mock`. No `fetch` stub.** Helper:
  ```ts
  function fakeGateway(overrides: Partial<JiraGateway>): JiraGateway {
    const notImpl = () => { throw new Error('not used in this test'); };
    return { getMyself: notImpl, searchIssues: notImpl, getIssue: notImpl,
             getTransitions: notImpl, transitionIssue: notImpl, createIssue: notImpl,
             ...overrides } as JiraGateway;
  }
  ```
  Coverage at minimum:
  - `quickCreate` prefixes summary with `[FE]: ` from config (not hardcoded), sets `priority.name = 'Lowest'` from config, sets `labels = ['Frontend']` from config, and sets `assignee.accountId` from the value `getMyself()` returned.
  - `quickCreate` short-circuits with `{ ok: false, reason: 'unauthorized' }` if `getMyself()` returns unauthorized — never calls `createIssue` on the gateway.
  - `loadBoard` builds JQL containing the configured `projectKey`, `labelFilter`, and `doneWindowDays`, calls `searchIssues`, and applies the configured `hideLabels` filter to the result.
  - `loadMyEpics` builds JQL containing the configured `statuses` (the `"In Progress"` value used to be hardcoded; this test pins that it's now driven by config).
  - `loadIssue` fetches the main issue, fetches sub-issues, and produces a `DetailIssue` whose `linkedRefs` come out of `toLinkedRef` shaping.
  - `loadIssue` maps a `not-found` reason from the gateway to `{ ok: false, reason: 'not-found' }` on the service result.
  - `getMyself`, `loadTransitions`, `performTransition` all propagate `unauthorized` from the gateway through unchanged.
  - At least one happy-path test for `loadBoard` exercises JQL escaping via real input (replaces what `jql.test.ts` covered today).
  - At least one happy-path test for `quickCreate` exercises ADF shape on the description (replaces what `plain-text-to-adf.test.ts` covered today).
- **Optional, recommended** `src/server/jira/http-gateway.test.ts` — a thin test of the adapter using `vi.stubGlobal('fetch', …)`, to pin auth-header construction, 401 → `{ ok: false, reason: 'unauthorized' }` mapping, and 404 → `{ ok: false, reason: 'not-found' }` mapping. Small surface; one test per error mapping rule is enough.
- `src/server/env.test.ts` is unchanged.

### Caller migration

The 7 frontend callers (`features/auth-status/AuthGate.tsx`, `features/board/use-board-issues.ts`, `features/ticket-detail/use-issue.ts`, `features/mr-status/MrSection.tsx`, `features/status-pill/use-transitions.ts`, `features/status-pill/use-transition-mutation.ts`, `features/quick-create/use-create-issue-mutation.ts`, `features/quick-create/use-my-epics.ts`) continue to import the same server functions from `~/server/jira`. The discriminated-union result shapes are preserved. **Net change at frontend call sites: zero.**

## Acceptance criteria

- [ ] `JiraGateway` port and `HttpJiraGateway` adapter live in separate files. The port file (`gateway.ts`) does not import anything from `http-gateway.ts`.
- [ ] `JiraAuthError` and `JiraHttpError` are not exported from `src/server/jira/index.ts` and have zero references outside `src/server/jira/http-gateway.ts`.
- [ ] The `try { … } catch (JiraAuthError) { … } catch (JiraHttpError 404) { … }` pattern appears in exactly one place (the adapter). `server-functions.ts` contains no `try`/`catch` blocks.
- [ ] The literals `'[FE]: '`, `'Frontend'`, `'Lowest'`, and `'In Progress'` each appear in exactly one location in `src/server/jira/` — `config.ts`. Grep confirms no other occurrences in the module.
- [ ] `src/server/jira/server-functions.ts` is meaningfully shorter (target: < 100 LOC, down from 400). Each of the 7 server functions is a thin wrapper over `service.<method>(input)`.
- [ ] `src/server/jira/index.ts` does not re-export `jiraClient`, `JiraAuthError`, `JiraHttpError`, `buildBoardJql`, `buildEpicJql`, `buildCreatePayload`, `plainTextToAdf`, `BoardJqlConfig`, or any `Jira*` wire types. Grep across `src/features/` confirms none of those symbols are imported.
- [ ] `src/server/jira/issue-service.test.ts` exists, uses a hand-rolled fake gateway, and contains no calls to `vi.mock` and no calls that stub `fetch`.
- [ ] `src/server/jira/jql.test.ts`, `epic-jql.test.ts`, `plain-text-to-adf.test.ts`, and `quick-create-payload.test.ts` are deleted. `quick-create-schema.test.ts` remains.
- [ ] All 7 frontend caller files are unchanged.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

None. Independent of in-progress Quick Create slices (e.g. 32) since the public server-function surface is preserved.

## Out of scope

- Promoting `[FE]:` / `Frontend` / `Lowest` / `"In Progress"` to env vars. Constants consolidate into one file; env promotion is a future one-line change if needed.
- The same refactor for `src/server/gitlab/`. Same shape, smaller surface — separate issue.
- A `jiraQueries` / `jiraMutations` namespace returning TanStack Query v5 `queryOptions()` to collapse caller hooks. Considered as alternative design C in the architecture exploration; defer to a separate issue if caller-side ergonomics become a pain point.

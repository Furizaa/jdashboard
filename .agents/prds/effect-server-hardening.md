# clashboard — Effect server hardening (Phase-1 follow-ups)

## Problem Statement

The Effect-TS server pass (PRD `effect-server-refactor.md`, ADR-0005) landed the architecture: ports + adapters per gateway, application services per use-case, `toWire` boundary mapper, `@effect/platform` HttpClient with retry/timeout middleware, `@effect/vitest` `it.effect` tests. The shape is right and the team-template lessons land.

A code review of the merged result surfaces a small but coherent set of follow-ups — not architectural rework, just the next ring of polish. Three categories:

- **One correctness/security gap.** The `loadIssue` sub-issue search interpolates the issue key into a JQL string without escaping (`parent = "${key}"`), where every other JQL-building site in the server uses a local `quoteJqlString`. The same key flows from a server-function input that today only checks "non-empty after trim" — the input never has to look like a real Jira issue key.

- **One commitment the architecture made but the implementation didn't fulfil.** ADR-0005 and CONTEXT-MAP.md both call out `effect/Schema` for server-internal validation, specifically `HttpClientResponse.schemaBodyJson(...)` for HTTP response shapes. The actual `decodeJsonBody<T>` helper in both gateways casts `unknown → T` with no runtime validation (`as Effect.Effect<T, GatewayError>`). Upstream API drift therefore produces silently mis-shaped values that fail much later inside the row-mapping code, far from the source. The cast also violates the project's "AVOID type assertions" rule.

- **A handful of smaller frictions** that don't earn their own driver but compound:
  - `Rejected` overloads three semantically distinct conditions: real upstream rejection (Jira/GitLab said no), transport failure (network), and JSON decode failure on a 2xx body. The wire client cannot distinguish them, so a network blip and a "parent missing" response surface identically to the user.
  - `loadMrStatuses` documents "concurrency 5 at the application-service level" but the inner `fetchMrBundle` is `concurrency: 'unbounded'` over 4 calls, so the effective in-flight is 20 — drift from the documented policy menu.
  - `Effect.catchTags({ NotFound: Effect.die, Rejected: Effect.die })` is repeated at fourteen call sites across application services. The combinator is the same shape every time.
  - The wire-call boilerplate `if (!wire.ok && wire.error._tag === 'InternalError') throw new Error('<name>: internal error')` is repeated at every server-function handler (eleven sites).
  - `getGitlabUser` returns a bespoke envelope (`{ ok: true, username, displayName }` / `{ ok: false, reason: 'unauthorized' }`) instead of the `WireResult` shape every other server-function returns — an asymmetry future readers will trip on.
  - `fakeJiraGateway` / `fakeGitlabGateway` need a final `as Shape` cast because `notImpl(label)` returns `Effect<never, never, never>` and doesn't satisfy the gateway shape's typed slots.

These are not on fire. The dashboard works. The driver is identical to the original Effect server pass: **team-template pedagogy + small anticipated growth**. The follow-ups close one security gap, redeem one architectural commitment, and tighten the lessons the codebase teaches.

## Solution

A bounded follow-up pass on `src/server/`:

- Extract a small `server/lib/jql.ts` module with `quoteJqlString(value)` (consolidates the three current copies) and `assertIssueKey(value)` (strict pattern validator). Use it in `loadIssue`'s parent JQL and in the server-function input validators that today only call `requireKey`.
- Adopt `effect/Schema` for HTTP response decoding in both gateway adapters. Define `Schema.Struct` shapes for `RawSearchResponse`, `RawDetailedIssue`, `RawAttachment`, `JiraUser`, `RawMrSummary`, `RawMrDetail`, `RawDiscussion`, `RawApprovals`, `RawMrReviewerWithState`, `GitlabUser`. Replace `decodeJsonBody<T>` with a Schema-aware decoder built on `HttpClientResponse.schemaBodyJson(schema)`. Drop the `as` cast.
- Split `Rejected` into two tagged errors per gateway: `Rejected` (4xx with parsed body — Jira/GitLab actively said no) and `TransportError` (network failure, decode failure, request encoding failure — the request didn't reach a meaningful answer). Per-context error unions decide which to surface and which to demote to defects, preserving today's user-visible behaviour where appropriate.
- Cap the inner MR fan-out so the documented "5 at application-service level" actually holds. The simplest change is `concurrency: 1` inside `fetchMrBundle` (4 sequential calls per MR × 5 MRs in flight = 20 sequential — but only 5 in flight at a time). Alternatively keep the inner fan-out at unbounded and drop the outer cap to 1; the choice is a policy-menu refresh.
- Extract a `dieOn(...tags)` Effect combinator (in `server/lib/`) for the demotion ladder. Each application service drops fourteen-ish lines.
- Extract a `runWire(program, errorSchema, label)` helper (in `server/server-functions/`) for the per-handler boilerplate. Each server function drops three-ish lines.
- Unify `getGitlabUser`'s envelope with `WireResult`. Update the one client caller.
- Make `notImpl<A, E>` polymorphic in the fake gateways and drop the `as Shape` casts.
- Update documentation so the codebase and the docs do not drift apart. Several claims in CONTEXT-MAP.md and ADR-0005 either become true after this work (Schema-validated bodies, "concurrency 5 at app-service level") or grow new tags (the wire error taxonomy gains `TransportError`). Either amend ADR-0005 in place with a clearly dated "Phase-1 follow-up" section, or land a follow-up ADR that frames these as the menu's upgrade-path being exercised — both routes documented as alternatives below.

Out of scope explicitly: `Effect.fn` adoption (deferred per project policy until Tracer goes from console-only to OTel — see ADR-0005's policy menu); `appRuntime.dispose()` shutdown hook (defer until Layer-scoped resources land); the `code-health` context still out of scope; database adoption still out of scope.

## User Stories

### Correctness & security

1. As clashboard's maintainer, I want every JQL-building site to escape interpolated values through one `quoteJqlString` helper, so that no future server code can accidentally interpolate a user-supplied key into a JQL string raw.
2. As a teammate touching the server, I want a single `assertIssueKey` validator at the server-function boundary, so that "what does a valid Jira issue key look like" is one declaration rather than scattered "non-empty after trim" checks.
3. As clashboard's maintainer, I want `loadIssue`'s sub-issue search to use `quoteJqlString` on the parent key, so that the JQL injection surface that today exists with crafted keys is closed.
4. As a teammate touching the server, I want the issue-key validator's pattern documented (`/^[A-Z][A-Z0-9]+-[1-9]\d*$/`) at its definition site, so that the regex's intent is explicit rather than inferred.
5. As clashboard's maintainer, I want server-function input validators to fail with a clear "invalid issue key" message when the pattern doesn't match, so that misuse surfaces as a 4xx-shaped rejection rather than a 500 once the bad key reaches Jira.

### Schema-validated HTTP bodies

6. As clashboard's maintainer, I want every HTTP response body decoded through `effect/Schema` rather than cast from `unknown`, so that upstream API drift fails fast at the gateway with a clear decode error rather than producing silently mis-shaped values that fail later in row-mapping code.
7. As a teammate adopting this template, I want `HttpClientResponse.schemaBodyJson(schema)` shown as the canonical pattern for HTTP body decoding, so that the team-template teaches the actual idiom rather than a cast-flavoured shortcut.
8. As clashboard's maintainer, I want one `Schema.Struct` declaration per raw gateway type, co-located with the existing `types.ts`, so that the schema and the TypeScript type cannot drift (the type is derived from the schema).
9. As clashboard's maintainer, I want each gateway adapter to map decode failures to `TransportError` (not `Rejected`), so that "Jira sent us something we couldn't decode" reads correctly as a transport-class problem rather than a Jira-side rejection.
10. As clashboard's maintainer, I want the `as Effect.Effect<T, GatewayError>` cast in `decodeJsonBody` removed, so that the server tree no longer violates the project's "avoid type assertions" rule.
11. As clashboard's maintainer, I want gateway tests assert the new decode-error path, so that schema-validated decoding is covered, not just hoped for.

### Error taxonomy split

12. As clashboard's maintainer, I want each gateway to expose three error tags (`Unauthorized`, `NotFound`, `Rejected`, `TransportError`), so that "the upstream said no with a body" and "the request never got a meaningful answer" are distinguishable on the wire.
13. As clashboard's maintainer, I want every per-context error union explicitly enumerate which transport-class outcomes propagate vs. which demote to defects, so that the wire shape is a deliberate decision per use-case, not an accident of which `catchTag` was used.
14. As a clashboard user, I want a Jira/GitLab transport blip on `quickCreate` to surface as a `TransportError` rather than a `Rejected` with a confusing "Jira request failed: …" message, so that the toast text matches what actually happened.
15. As clashboard's maintainer, I want existing tests for the `Rejected` mapping continue to pass against the renamed `Rejected` (which now means strictly "4xx with body"), so that no test rewrites are needed for the renamed-but-unchanged-semantics case.
16. As clashboard's maintainer, I want new tests for the `TransportError` path in each gateway (network error, decode error, encoding error), so that the split is covered by behaviour tests, not just type signatures.

### Concurrency policy parity

17. As clashboard's maintainer, I want the actual concurrency in flight during MR fan-outs match the documented policy menu ("5 at the application-service level"), so that the docs and the runtime tell the same story.
18. As clashboard's maintainer, I want the change to take the minimum-blast-radius shape (cap the inner fan-out, leave the outer cap at 5), so that the user-visible request budget changes from 20 in flight to 5 in flight without introducing a new RateLimiter Layer.
19. As a teammate adopting this template, I want the "compose'd schedule caps an exponential schedule to N attempts" pattern in `app-layer.ts` annotated with a one-line comment, so that the next reader doesn't have to re-read the Effect docs to confirm what `Schedule.compose(Schedule.recurs(2))` does.

### Boilerplate consolidation

20. As clashboard's maintainer, I want a `dieOn(...tags)` combinator that demotes the listed tagged errors to defects, so that fourteen near-identical `.pipe(Effect.catchTags({ NotFound: Effect.die, Rejected: Effect.die }))` blocks become one-liners.
21. As clashboard's maintainer, I want `dieOn` accept type-narrowed tag literals, so that misspelling a tag is a compile error rather than a silent no-op.
22. As clashboard's maintainer, I want a `runWire(program, errorSchema, label)` helper at the server-function boundary, so that the eleven copies of `if (!wire.ok && wire.error._tag === 'InternalError') throw new Error('<name>: internal error')` collapse to one line per handler.
23. As clashboard's maintainer, I want `runWire` derive the InternalError-throw label from the call site (passed in as the `label` arg), so that the existing "name in the thrown Error" debug affordance is preserved.

### Wire-shape uniformity

24. As clashboard's maintainer, I want `getGitlabUser` return the `WireResult` shape every other server-function returns, so that the wire vocabulary is one set of rules end-to-end.
25. As clashboard's maintainer, I want the single client-side caller of `getGitlabUser` migrated to read the unified `WireResult` shape, so that the rename lands in one PR with no half-migrated state.

### Test ergonomics

26. As a teammate writing a new application-service test, I want `notImpl` in the fake-gateway helpers be polymorphic in `A`/`E`, so that the `as Shape` cast at the bottom of `fakeJiraGateway` / `fakeGitlabGateway` disappears.
27. As a teammate writing a new gateway, I want the fake-gateway pattern (placeholder `notImpl` for every method, spread overrides) documented in the gateway folder's `CONTEXT.md` (or the closest equivalent), so that the next gateway lands the convention without re-deriving it.

### Documentation drift

28. As a teammate reading the codebase, I want CONTEXT-MAP.md's "Schema (server-internal)" claim to be true after this work — `HttpClient.schemaBodyJson` is the actual pattern in the gateways, not aspirational, so that the doc and the code agree.
29. As a teammate reading the codebase, I want the wire error taxonomy in CONTEXT-MAP.md and ADR-0005 list `TransportError` alongside `Unauthorized` / `NotFound` / `Rejected`, so that a reader enumerating possible wire shapes sees the full set.
30. As a teammate reading the codebase, I want the "Concurrency: 5 at the application-service level" policy-menu line in CONTEXT-MAP.md and ADR-0005 reflect what the runtime actually does, so that the policy menu does not lie.
31. As a teammate reading the codebase, I want a clear paper trail for the Schema-validation adoption (either an in-place dated "Phase-1 follow-up" section in ADR-0005 or a follow-up ADR that frames the menu's upgrade path being exercised), so that the architectural decision and its evolution are both legible.
32. As a teammate reading the codebase, I want the README mention `assertIssueKey`/`quoteJqlString` (or simply not contradict them) — flagging a doc check, not committing to a specific edit, so that no other doc surface drifts unnoticed.
33. As clashboard's maintainer, I want each context's `CONTEXT.md` (where it exists) cross-checked for any line that names `Rejected` as the catch-all transport-error tag, so that the per-context docs catch the rename as well.

## Implementation Decisions

### Module sketch

The work introduces three small modules and modifies a handful of existing files. The new modules are deep — they encapsulate behaviour behind a simple, stable interface, and each is testable in isolation.

- **`server/lib/jql.ts`** (new) — `quoteJqlString(value)` and `assertIssueKey(value)`. Pure functions. The single home for "how do I escape something into a JQL clause" and "what does a valid Jira issue key look like."
- **Schema-aware HTTP body decoder** (new) — exposed as a small helper next to each gateway's HTTP adapter. Takes a `Schema.Schema<T>` and a response, returns `Effect<T, TransportError | Rejected>`. The cast goes away; decode failures route to `TransportError`.
- **Per-gateway response schemas** (new) — `Schema.Struct` declarations co-located with the existing `types.ts`. The TypeScript types previously written by hand are derived from the schemas (`Schema.Schema.Type<typeof RawSearchResponseSchema>`).
- **`server/lib/die-on.ts`** (new) — `dieOn(...tags)` Effect combinator. Type-narrowed against the input error union so misspellings are compile errors.
- **`server/server-functions/run-wire.ts`** (new) — `runWire(program, errorSchema, label)` helper that wraps `appRuntime.runPromise(toWire(...))` and the InternalError-throw boilerplate.
- **`gateways/{jira,gitlab}/errors.ts`** (modified) — add `TransportError` tagged class. Keep `Rejected`, narrow its semantics to "4xx with body."
- **`gateways/{jira,gitlab}/http-adapter.ts`** (modified) — adopt the schema-aware decoder; route network/decode/encoding failures to `TransportError`.
- **`contexts/*/errors.ts`** (modified) — each context's error union may grow `TransportError` if the use-case wants to surface it. The default is "demote `TransportError` to a defect" (matching today's behaviour where `Rejected` from a transport failure was demoted via `Effect.die`).
- **`contexts/detail/application/load-issue.ts`** (modified) — adopt `quoteJqlString` for the parent JQL.
- **`contexts/board/application/load-mr-statuses.ts`** and/or **`gateways/gitlab/mr-fanout.ts`** (modified) — cap the inner fan-out so the in-flight budget matches the documented "5".
- **`runtime/app-layer.ts`** (modified) — one-line comment on the `Schedule.compose(Schedule.recurs(...))` pattern.
- **`server-functions/*.ts`** (modified) — adopt `runWire`; align `getGitlabUser`'s envelope.
- **`__fixtures__/fake-*-gateway.ts`** (modified) — polymorphic `notImpl<A, E>`; drop the `as Shape` cast.

### Documentation deltas

- **CONTEXT-MAP.md** — Three lines need refreshing: (a) the Schema (server-internal) row in the libraries table to point at `HttpClient.schemaBodyJson` as the implemented pattern; (b) the wire error taxonomy enumeration to include `TransportError`; (c) the concurrency policy line under "Server-side policy menus" if it currently overstates the actual cap.
- **`docs/adr/0005-effect-server-architecture.md`** — Two options:
  - **Option A** (smaller edit): append a dated "Phase-1 follow-up" section that records the Schema adoption, the `Rejected`/`TransportError` split, and the concurrency cap correction, framed as the policy menu's upgrade path being exercised. The original ADR's narrative stands.
  - **Option B** (separate ADR): land `docs/adr/0007-server-schema-bodies-and-transport-error-split.md`. Cross-link from ADR-0005's policy menus.
    Option A is recommended for blast-radius and reader-locality reasons. The choice is the maintainer's call.
- **`docs/adr/0006-binary-stream-api-routes.md`** — likely untouched; flagged for visual scan only.
- **README** — likely untouched (high-level enough); flagged for visual scan only.
- **Per-context `CONTEXT.md` files** — anywhere a context names `Rejected` as the catch-all transport-error tag, update to mention `TransportError` alongside.
- **`docs/architecture.svg`** — regenerated only if `dependency-cruiser` rules change. None planned.

### Migration phasing

The work is small enough for two PRs end-to-end, but a three-PR split keeps blast radius contained:

1. **PR 1 — JQL safety + boilerplate consolidation.** `server/lib/jql.ts`, `server/lib/die-on.ts`, `server/server-functions/run-wire.ts`. Apply `quoteJqlString` to `loadIssue`. Apply `dieOn` and `runWire` to all call sites. Polymorphic `notImpl`. Wire-shape unification for `getGitlabUser`. No semantic change visible to the client beyond the JQL escape; full test pass-through.
2. **PR 2 — Schema-validated HTTP bodies + error split.** Define `Schema.Struct` per raw type. Replace `decodeJsonBody<T>` with the schema-aware decoder. Add `TransportError`, narrow `Rejected`. Update gateway error mapping. Update per-context error unions. Add the new test cases. Concurrency cap correction (one-line change). `Schedule.compose` comment.
3. **PR 3 — Documentation refresh.** CONTEXT-MAP.md edits. ADR-0005 follow-up section (or new ADR). Per-context CONTEXT.md scans.

Feature freeze on the affected files only. The e2e harness (ADR-0001) is the safety net.

## Testing Decisions

### What makes a good test

Same rules as the parent refactor (per ADR-0005 / `effect-server-refactor.md`):

- Tests assert the **port contract** of a layer, not its internal structure.
- Pure-function modules are tested with table-driven input/output; no Effect.
- HTTP adapter modules are tested by faking `HttpClient.HttpClient` via `Layer.succeed(...)` against canned wire responses.
- Application-service modules are tested by faking gateway ports via `Layer.succeed(JiraGateway, fakeJira)`.
- Server-function handlers are not unit-tested; the e2e harness covers them.

### New tests to write

- **`server/lib/jql.test.ts`** — `quoteJqlString`: empty string, embedded `"`, embedded `\`, both. `assertIssueKey`: canonical key (`HDR-1`), keys with multi-letter prefixes (`HDR42-9999`), keys with leading zero (`HDR-0` rejected), lowercase (rejected), trailing whitespace (rejected; user must trim before calling), empty (rejected). Pattern parallels `load-board.test.ts`'s existing escape test.
- **`server/lib/die-on.test.ts`** — Three cases: tag-in-list demotes to defect (assert via `Exit.isDie`), tag-not-in-list propagates as failure (assert via `Effect.flip`), no-op when input effect succeeds.
- **`server/server-functions/run-wire.test.ts`** — Two cases: success program returns the wire envelope unchanged; defect program throws an Error whose message contains the label.
- **Gateway HTTP adapter tests (additions)** — Per gateway: one test for the new decode-failure path (canned response with the wrong shape; assert `TransportError._tag`); one test asserting that `TransportError` is surfaced for a network failure (today's "Jira request failed: …" path now lives there); the existing `Rejected` test gets a one-line update to confirm `Rejected` only fires for 4xx-with-body.
- **Application-service tests (additions)** — Per context that surfaces `TransportError` to the wire (likely just `capture` and possibly `detail`): one test asserting `TransportError` propagates as a tagged failure rather than being demoted to a defect. Where the policy is "demote `TransportError` to defect," one test asserting the demotion (via `Exit.isDie`).

### Tests that don't change

- All existing `to-wire.test.ts` cases stand.
- All existing pure-domain tests (`build-create-payload`, `plain-text-to-adf`, `enrich-adf-with-media`, the `gitlab/mr/*` modules, `mr-key-map`, `mr-status`) stand — none of them touch the changed modules.
- `server-env.test.ts` stands.
- The application-service tests for the renamed `Rejected` (semantics narrowed to 4xx-with-body) stand because today's tests already canned 4xx-with-body responses.

### Prior art

- **`load-board.test.ts`** for the JQL-escape pattern (table-driven, asserts the captured JQL string).
- **`http-adapter.test.ts`** (both gateways) for the `fakeHttpClient` + `Layer.succeed` pattern that any new HTTP adapter test should follow.
- **`to-wire.test.ts`** for the success / failure / defect three-branch pattern that `run-wire.test.ts` should mirror.
- **The hand-rolled fakes in `__fixtures__/`** as the model for any new application-service test in the `TransportError` path.

## Out of Scope

- **`Effect.fn` adoption.** Deferred until Tracer goes from console-only to OTel per ADR-0005's policy menu. Not gated on this PRD.
- **`appRuntime.dispose()` / shutdown hook.** Deferred until Layer-scoped resources land (DB pools, OTel exporters with flush-on-shutdown). Today's process-scope `ManagedRuntime` matches the TanStack Start lifecycle.
- **`code-health` context, database adoption, ingestion fiber.** Still out of scope per the parent PRD. The Schema work here informs the shape of future ingestion-payload schemas but does not build them.
- **Per-gateway `RateLimiter` Layer.** Deferred until Jira's 100 req/min limit is actually hit. The concurrency-cap fix is not the same change.
- **Replacing `Rejected`'s human-readable message field with structured fields.** The `message: Schema.String` shape stays; only the routing of which conditions produce `Rejected` vs `TransportError` changes.
- **Re-shaping the Zod `quickCreateSchema`.** Stays exactly as today; the boundary-validator role is unchanged.
- **`oxlint` / `dependency-cruiser` rule additions.** No new rules are needed; the existing rules continue to enforce the architecture.
- **Client-side changes.** Only the one `getGitlabUser` caller migrates (the wire-shape unification). No other client code is touched.
- **A new ADR for `dieOn` / `runWire`.** They're internal helpers, not architectural decisions worth their own ADR.

## Further Notes

- The project memory `project_effect_server_pedagogy.md` records that this server refactor is "90% pedagogy + 10% growth" and that policy decisions are framed as menus with chosen point + upgrade path. This PRD is exactly the menu's upgrade path being exercised: HTTP body validation moves from "documented but cast" to "implemented"; concurrency cap moves from "documented but drifted" to "implemented as documented." Framing this as the menu working as designed (not as "we got it wrong the first time") is the team-template lesson worth landing in whichever ADR variant is chosen.
- The HDR-Jira project memories (`project_jira_status_casing.md`, `project_jira_priority_undefined.md`) inform the per-gateway schema declarations: status comparisons must remain case-insensitive when the schemas are introduced (don't accidentally tighten via a literal-union schema), and the `priority.name === "Undefined"` sentinel must continue to be tolerated by the schema (don't reject it as an invalid priority shape).
- The ADR-0005 policy-menu framing means there is no "right answer" between Option A (in-place ADR amendment) and Option B (follow-up ADR). The team-template angle slightly prefers Option A because it keeps the ADR's narrative single-threaded; the historical-record angle slightly prefers Option B because it makes the menu's evolution legible at file granularity. The maintainer picks.
- The three-PR phasing is recommended but not required. PR 1 has zero dependency on PR 2; PR 3 has hard dependencies on both. A single-PR variant is acceptable if the diff is small enough to review comfortably — that's a maintainer judgement at PR-write time.

# 65 — Effect server: Capture context migration (Zod-at-boundary + Schema-internal lesson)

**Type:** AFK

## Parent

[Effect server refactor PRD](../prds/effect-server-refactor.md)

## What to build

End-to-end migration of the **Capture server-side flow** (`quickCreate`, `getMyEpics`, `getMyself`) into the new Effect-TS architecture, following the Board exemplar from slice 63. The key team-template lesson this slice teaches is the **Zod-at-the-boundary + `effect/Schema`-for-internal-validation** split decided in Q6 of the grill: `quickCreateSchema` (Zod) stays at the wire boundary because the client's TanStack Form consumes it; any further server-internal validation uses Schema. This is the structurally honest answer "one validator per side of the boundary, not per repo," and Capture is where it lands as a worked example.

After this slice merges, Capture's three use-cases are Effect-based application services in `src/server/contexts/capture/application/`; the corresponding server functions are in `src/server/server-functions/capture.ts`; `quickCreateSchema` is `git mv`'d to the new home; the client kernel re-export updates accordingly; the Jira gateway is reused as-is from slice 63.

Concretely:

- **Capture context** in `src/server/contexts/capture/`:
  - `config.ts` — `class CaptureConfig extends Context.Tag(...)<CaptureConfig, { projectKey: string; quickCreate: QuickCreateConfig; epic: EpicConfig; baseUrl: string }>() {}` plus `CaptureConfigLive: Layer<CaptureConfig, never, ServerEnv>`. The `defaultQuickCreateConfig` and `defaultEpicConfig` constants from `server/jira/config.ts` migrate to `contexts/capture/config.ts` (they are Capture-specific). Old `server/jira/config.ts` is deleted in this slice if no other consumer remains; otherwise left orphaned for lockdown 67.
  - `errors.ts` — Capture's per-context error unions: `QuickCreateError = Schema.Union(Unauthorized, Rejected)`, `LoadMyEpicsError = Schema.Union(Unauthorized)`, `GetMyselfError = Schema.Union(Unauthorized)`.
  - `application/quick-create-schema.ts` — `git mv` from `server/jira/quick-create-schema.ts`. **Stays as a Zod schema** (per Q6 (d): Zod at the client-crossing boundary).
  - `application/quick-create.ts` — `Effect<QuickCreateOk, QuickCreateE, JiraGateway | CaptureConfig>`. The application service receives an already-Zod-validated `QuickCreateInput` (validation runs in the server-function `inputValidator` — see below). Internal logic — `getMyself` for `accountId`, `buildCreatePayload`, `createIssue` — composed with `Effect.gen` and `Effect.catchTag`.
  - `application/load-my-epics.ts` — `Effect<LoadMyEpicsOk, LoadMyEpicsE, JiraGateway | CaptureConfig>`.
  - `application/get-myself.ts` — `Effect<GetMyselfOk, GetMyselfE, JiraGateway>`.
  - `application/{quick-create, load-my-epics, get-myself}.test.ts` — `@effect/vitest`'s `it.effect` with hand-rolled fakes via `Layer.succeed(JiraGateway, fake)`. `quick-create.test.ts` covers both transitive `Unauthorized` paths (from `getMyself` and from `createIssue`) and the `Rejected` path.
  - `application/__fixtures__/fake-jira-gateway.ts` — per-context hand-rolled fake.
  - `domain/` — `plainTextToAdf` (currently in `issue-service.ts`) and `buildCreatePayload` (also in `issue-service.ts`) move here as pure helpers. Existing tests follow via `git mv` if they exist; otherwise add small unit tests in this slice.
  - `CONTEXT.md` — short, focused per-context doc; explicitly notes the **Zod-at-boundary lesson**: "the form input crosses the client/server boundary, so its schema is Zod (consumed by TanStack Form on the client and the server-function `inputValidator` on the server). Server-internal validation uses `effect/Schema`."
- **Server functions** in `src/server/server-functions/capture.ts`:
  - `createIssue` — `.inputValidator((data) => quickCreateSchema.parse(data))` then `.handler(({ data }) => appRuntime.runPromise(toWire(quickCreate(data).pipe(...), QuickCreateError)))`. The Zod parse remains at the boundary; Schema is not introduced for this contract.
  - `getMyEpics` — `appRuntime.runPromise(toWire(loadMyEpics, LoadMyEpicsError))`.
  - `getMyself` — `appRuntime.runPromise(toWire(getMyself, GetMyselfError))`.
- **Route updates.** Routes/components that imported `getMyself`, `createIssue`, `getMyEpics` from `~/server/jira/server-functions` switch to `~/server/server-functions/capture`.
- **Client kernel re-export.** `src/kernel/jira.ts` re-exports `quickCreateSchema` and `QuickCreateInput` — its source path updates from `~/server/jira` to `~/server/contexts/capture/application/quick-create-schema`. The `kernel-cant-import-app-code` rule (existing) considers `src/server/contexts/...` server, not app — confirm the rule path matches; adjust if needed (`kernel` is allowed to re-export from `server/...` per CONTEXT-MAP).
- **Old code preserved.** `src/server/jira/server-functions.ts` is now empty after this slice (Board took `searchIssues` in 63; Detail took `getIssue`/`getTransitions`/`transitionIssue` in 64; Capture takes the rest now). The empty file can be deleted in this slice. `src/server/jira/issue-service.ts` is fully orphaned; not deleted until 67.

## Acceptance criteria

- [ ] `src/server/contexts/capture/{config, errors, application, CONTEXT.md}` exist and are populated.
- [ ] `application/quick-create-schema.ts` is `git mv`'d from `server/jira/quick-create-schema.ts`; remains a Zod schema (no Schema rewrite).
- [ ] `application/{quick-create, load-my-epics, get-myself}.ts` each export an `Effect<...>` program with the appropriate `R` channel.
- [ ] Each application module has a sibling `*.test.ts` using `@effect/vitest` + `Layer.succeed`. Hand-rolled per-context fake gateway in `__fixtures__/`. Both success and tagged-error paths asserted (`quick-create.test.ts` covers `Unauthorized` from both transitive sources and `Rejected`).
- [ ] `application/quick-create.ts`'s code does NOT import `effect/Schema` for parsing the input — the input arrives already-Zod-parsed from the server-function boundary. Server-internal use of `effect/Schema` (e.g. for any HTTP response shape decoding) is fine.
- [ ] `domain/` contains the pure helpers (`plainTextToAdf`, `buildCreatePayload`) extracted from `issue-service.ts`.
- [ ] `src/server/server-functions/capture.ts` exports `getMyself`, `createIssue`, `getMyEpics`. `createIssue.inputValidator` uses the Zod `quickCreateSchema`; the handler uses `appRuntime.runPromise(toWire(...))`.
- [ ] `src/kernel/jira.ts` re-exports `quickCreateSchema` and `QuickCreateInput` from `~/server/contexts/capture/application/quick-create-schema`; client form code unaffected (the import path through `~/kernel` is unchanged).
- [ ] `src/server/jira/server-functions.ts` is deleted (its content has been migrated across 63/64/65).
- [ ] `src/server/jira/config.ts` is deleted if no other consumer remains; if `issue-service.ts` still imports it, leave both for lockdown 67.
- [ ] `CONTEXT.md` documents the Zod-at-boundary lesson explicitly.
- [ ] All `if (!result.ok) { if (reason === '…') … }` ladders in the migrated Capture path are gone.
- [ ] No file under `src/server/contexts/capture/` imports from `src/server/contexts/<other>/`, from `react`, `@tanstack/react-*`, `sonner`, `window`, `document` (verified by `dependency-cruiser`).
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test && pnpm test:e2e` all green.
- [ ] User-visible behaviour is identical (Quick Create flow works end-to-end via e2e).
- [ ] `docs/architecture.svg` regenerated and committed.

## Blocked by

- 63 — Effect server: Board context migration (Jira gateway + Board exemplar)

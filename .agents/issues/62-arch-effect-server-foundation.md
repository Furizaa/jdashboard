# 62 — Effect server: foundation (deps, scaffolding, runtime, `toWire`, dep-cruiser rules)

**Type:** AFK

## Parent

[Effect server refactor PRD](../prds/effect-server-refactor.md)

## What to build

A single PR that lands the Effect-TS server-side architectural foundation with **no behaviour change**. After this PR merges, master compiles, e2e passes, the user-visible app is identical, and every subsequent server context-migration slice (63–66) can land against an already-prepared scaffold.

This is the only slice in the server refactor that is intentionally horizontal — it ships infrastructure rather than a vertical user-visible flow, mirroring slice 51's role for the client refactor. It is sized so the entire diff is reviewable as one unit; splitting it would create intermediate states that don't compile.

Concretely:

- **Library installs.** Add `effect` and `@effect/platform` (runtime); `@effect/vitest` (dev). The `HttpClient`'s runtime adapter is whichever the current `@effect/platform` version uses for fetch-based environments — pin to the version current at PR-open time. No `@effect/sql` (reserved for the future `code-health` work, out of scope per PRD).
- **Folder scaffolding.** Create empty `src/server/{runtime, wire, gateways, server-functions}` and `src/server/contexts/{board, detail, capture, review}` with `.gitkeep` files. Existing `src/server/{env.ts, jira/, gitlab/}` are untouched in this slice.
- **Runtime layer (`src/server/runtime/`).**
  - `server-env.ts` — `class ServerEnv extends Context.Tag("ServerEnv")<ServerEnv, ServerEnvShape>() {}` plus `ServerEnvLive: Layer<ServerEnv>` that runs today's `readAndValidate()` logic and fails fast on missing env. The existing `getServerEnv()` lazy singleton stays in place this slice — old code paths still call it; new code paths use `yield* ServerEnv`.
  - `app-layer.ts` — exports `appLayer = Layer.mergeAll(ServerEnvLive, …HttpClientLive…)`. Initially merges only `ServerEnvLive` and the configured `HttpClient.layer` with retry+timeout middleware (2 retries exp backoff transient-only; 10s default timeout, per PRD §"Implementation Decisions"). Gateway and context layers are added as 63–66 land.
  - `app-runtime.ts` — exports `appRuntime = ManagedRuntime.make(appLayer)`. One module-level singleton for the process.
- **Wire boundary mapper (`src/server/wire/`).**
  - `to-wire.ts` — `toWire<A, E>(program, errorSchema)` per PRD §"The wire boundary mapper". Includes the `Effect.catchAllDefect` arm that logs and demotes to `{ ok: false, error: { _tag: 'InternalError' } }`.
  - `to-wire.test.ts` — direct unit tests using `@effect/vitest`'s `it.effect`: success program → `{ ok: true, ...A }`; failure with a `Schema.TaggedError` → `{ ok: false, error: { _tag, ...payload } }`; defect path → `{ ok: false, error: { _tag: 'InternalError' } }`.
- **`@effect/vitest` wiring.** Confirm `vitest.config.ts` is compatible; nothing prevents `it.effect(...)` from running. Smoke test in `to-wire.test.ts`.
- **Dependency-cruiser rules added to `.dependency-cruiser.cjs`** at `error` severity from inception (folders are empty, so rules pass trivially):
  - `no-effect-on-client` — `effect` cannot be imported from `src/{contexts, widgets, coordinator, routes, kernel}/`.
  - `no-neverthrow-on-server` — `neverthrow` cannot be imported from `src/server/`.
  - `no-cross-context-server` — `src/server/contexts/A → src/server/contexts/B` for any A ≠ B.
  - `no-cross-gateway-adapter` — `src/server/gateways/<X>/http-adapter.ts` cannot import from `src/server/gateways/<Y>/...`.
- **No imports of new infrastructure from old paths.** `src/server/jira/`, `src/server/gitlab/` are untouched. Old server-functions still serve all routes.

## Acceptance criteria

- [ ] `pnpm install` succeeds; `effect`, `@effect/platform`, `@effect/vitest` are installed at pinned current versions.
- [ ] `src/server/{runtime, wire, gateways, server-functions}` and `src/server/contexts/{board, detail, capture, review}` exist with `.gitkeep`s; the existing `src/server/{env.ts, jira/, gitlab/}` are unchanged.
- [ ] `src/server/runtime/{server-env.ts, app-layer.ts, app-runtime.ts}` exist; `appRuntime` is a `ManagedRuntime` constructed from `appLayer`; `appLayer` merges `ServerEnvLive` and the configured `HttpClient.layer` (retry exp backoff 2 attempts transient-only; 10s timeout).
- [ ] `src/server/wire/to-wire.ts` exports `toWire<A, E>(program, errorSchema)` that produces `{ ok: true, ...A }` on success, `{ ok: false, error: { _tag, ...payload } }` on tagged failure, and `{ ok: false, error: { _tag: 'InternalError' } }` on defect.
- [ ] `src/server/wire/to-wire.test.ts` covers the three paths via `@effect/vitest`'s `it.effect`. Tests pass.
- [ ] `.dependency-cruiser.cjs` contains four new rules at `error` severity: `no-effect-on-client`, `no-neverthrow-on-server`, `no-cross-context-server`, `no-cross-gateway-adapter`. `pnpm depcruise` exits 0.
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test && pnpm test:e2e` all green.
- [ ] No file inside `src/server/{env.ts, jira/, gitlab/}` is functionally modified.
- [ ] `appRuntime` is unused by any handler — old paths continue to serve all routes. (Sanity: a grep for `appRuntime.runPromise` matches only `to-wire.test.ts` after this PR.)
- [ ] `docs/architecture.svg` regenerated and committed.
- [ ] User-visible behaviour is identical (e2e is the gate).

## Blocked by

None — can start immediately.

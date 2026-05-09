# 68 — Effect server: `tour.md` server-side trace + `layers.md` server-layer examples

**Type:** AFK

## Parent

[Effect server refactor PRD](../prds/effect-server-refactor.md)

## What to build

The team-template's narrative documentation is finalised here. Today's `docs/tour.md` traces "click status pill → transition lands" through the client's layers and stops at the wire boundary because the server was out of scope at the time. With the Effect-TS server pass merged through lockdown 67, this slice **continues the trace into the server** and adds **server-layer examples** to `docs/layers.md`. Both are extensions to existing docs, not new files.

ADR-0005, the PRD, the CONTEXT-MAP append, and the ADR-0004 addendum were drafted during the grilling session and already exist in master before slice 62 lands; this slice does not re-author them.

Concretely:

- **`docs/tour.md` extension.** Append a "Server side: from handler to gateway and back" section that follows the existing tour's prose style. Trace one request — `searchIssues` (the Board's loadBoard handler) is the natural choice since it's the simplest end-to-end vertical slice exercised by 63.
  - Step: TanStack Start receives the call → invokes the handler in `src/server/server-functions/board.ts`.
  - Step: handler calls `appRuntime.runPromise(toWire(loadBoard.pipe(Effect.provide(BoardConfigLive)), LoadBoardError))`.
  - Step: `appRuntime` is the process-scoped `ManagedRuntime`; resolving the `R` channel composes `JiraGateway` (via `JiraGatewayLive`), `BoardConfig`, `ServerEnv`, and `HttpClient.layer` — including retry+timeout middleware.
  - Step: inside `loadBoard`, `Effect.gen` unwraps the gateway Tag, builds the JQL, calls `gateway.searchIssues(...)`, maps the `BoardIssue[]`.
  - Step: `gateway.searchIssues` (in `gateways/jira/http-adapter.ts`) issues an HTTP request via `HttpClient.execute`; response decoded via `HttpClientResponse.schemaBodyJson`; HTTP errors mapped to `Schema.TaggedError` classes (`Unauthorized` on 401, `NotFound` on 404, `Rejected` otherwise).
  - Step: response bubbles back up; `toWire` converts `Effect<LoadBoardOk, LoadBoardE>` to `{ ok: true, baseUrl, issues } | { ok: false, error: { _tag, ...payload } }`.
  - Step: TanStack Start serialises the wire shape; the client's neverthrow + ts-pattern code unwraps on the other side.
  - Include short code excerpts from the actual landed files at each step (`gateways/jira/port.ts`, `contexts/board/application/load-board.ts`, `wire/to-wire.ts`, `server-functions/board.ts`).
- **`docs/layers.md` extension.** Add a "Server layers" section with one annotated example per server-side layer, following the existing layer-by-layer structure:
  - **Server domain** — pick a small pure module from the migrated codebase (e.g. `gateways/gitlab/mr/review-state.ts`, post-66). Annotate why it's domain (no I/O, no time, no Effect imports unless trivial Schema).
  - **Gateway port** — the `JiraGateway` `Context.Tag` definition from `gateways/jira/port.ts`. Annotate the Tag pattern, the method signatures returning `Effect<A, E>`.
  - **Gateway adapter** — a method from `gateways/jira/http-adapter.ts` (e.g. `searchIssues`). Annotate `HttpClient.execute` + `Effect.flatMap(HttpClientResponse.schemaBodyJson(WireResponse))` + `Effect.catchTag("ResponseError", mapHttpError)`.
  - **Application service** — `contexts/board/application/load-board.ts`. Annotate `Effect.gen`, the `R` channel listing `JiraGateway | BoardConfig`, the tagged-error short-circuit.
  - **Wire boundary mapper** — `wire/to-wire.ts` annotated. The success-pass-through, the `Schema.encodeUnknownSync(errorSchema)` for the failure path, and the `Effect.catchAllDefect` arm.
  - **Server-function handler** — `server-functions/board.ts`. The thin shell calling `appRuntime.runPromise(toWire(...))`.
- **No new files.** Both updates are to `docs/tour.md` and `docs/layers.md` only.

## Acceptance criteria

- [ ] `docs/tour.md` contains a "Server side: from handler to gateway and back" section that traces `searchIssues` (Board's loadBoard handler) through every server layer with code excerpts from the actual landed files.
- [ ] `docs/tour.md`'s server section explicitly names: `appRuntime`, `ManagedRuntime`, the `R` channel, `HttpClient`, retry+timeout middleware, `Schema.TaggedError`, `toWire`, `Effect.catchAllDefect`. Each name links to or quotes the file it lives in.
- [ ] `docs/layers.md` contains a "Server layers" section with six annotated examples — one per server layer (domain, gateway port, gateway adapter, application service, wire boundary mapper, server-function handler).
- [ ] Each example in `docs/layers.md` quotes from a real landed file in `src/server/...` and explains _why_ the snippet belongs to that layer.
- [ ] `docs/tour.md` and `docs/layers.md` are internally consistent with `CONTEXT-MAP.md`'s "Server architecture (Effect-TS pass)" section and with `docs/adr/0005-effect-server-architecture.md`. Cross-references work.
- [ ] No new markdown files added under `docs/`. (Per-context `server/contexts/<name>/CONTEXT.md` files were written in 63–66.)
- [ ] Prose style matches the existing client-side sections of `tour.md` and `layers.md`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` all green (no code changes in this slice; checks confirm nothing accidentally broken).

## Blocked by

- 67 — Effect server: lockdown (delete old, rules to `error`)

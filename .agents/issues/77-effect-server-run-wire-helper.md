# 77 — Effect server: `runWire` helper + apply across server-functions

**Type:** AFK

## Parent

[Effect server hardening PRD](../prds/effect-server-hardening.md)

## What to build

Replace the eleven copies of the per-handler `appRuntime.runPromise(toWire(...))` + InternalError-throw boilerplate with a single `runWire(program, errorSchema, label)` helper. Each handler shrinks from ~6 lines to one.

Concretely:

- **New `src/server/server-functions/run-wire.ts`**:
  - Signature:
    ```
    function runWire<A extends object, E, IE extends { _tag: string }, R>(
      program: Effect.Effect<A, E, R>,
      errorSchema: Schema.Schema<E, IE, never>,
      label: string,
    ): Promise<WireResult<A, IE>>
    ```
  - Implementation: `appRuntime.runPromise(toWire(program, errorSchema))`; when the wire result is `{ ok: false, error: { _tag: 'InternalError' } }`, throws `new Error(\`\${label}: internal error\`)`; otherwise returns the wire envelope.
  - The return type narrows `IE` to exclude `InternalErrorPayload` (since that branch is unreachable post-throw), removing the per-handler `as <ResultType>` cast.
- **New `src/server/server-functions/run-wire.test.ts`** — two cases:
  - Success program → returns `{ ok: true, ...payload }` envelope.
  - Defect program (`Effect.die(...)`) → throws an Error whose message contains the label.
- **Apply** at every server-function handler. Each handler's body becomes `runWire(program, ErrorSchema, '<handler-name>')`:
  - `server-functions/board.ts`: `searchIssues`, `getMrStatuses`.
  - `server-functions/detail.ts`: `getIssue`, `getTransitions`, `transitionIssue`.
  - `server-functions/capture.ts`: `getMyself`, `createIssue`, `getMyEpics`.
  - `server-functions/review.ts`: `getReviewCards`. The bespoke-shaped `getGitlabUser` is migrated separately in slice 79; if 77 lands first, leave `getGitlabUser`'s inline `runPromise + InternalError check` for now.

## Acceptance criteria

- [ ] `src/server/server-functions/run-wire.ts` exports `runWire` with the documented signature.
- [ ] `src/server/server-functions/run-wire.test.ts` covers success-passthrough and defect-throw-with-label.
- [ ] All ten server-function handlers (excluding `getGitlabUser`) use `runWire`.
- [ ] No remaining `if (!wire.ok && wire.error._tag === 'InternalError') throw new Error(...)` blocks in the migrated handlers.
- [ ] No remaining `as <ResultType>` cast at the migrated handler return statements.
- [ ] Existing tests / e2e green.
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm test && pnpm test:e2e` all green.

## Blocked by

None — can start immediately.

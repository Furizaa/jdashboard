# 76 — Effect server: `dieOn` combinator + apply across application services

**Type:** AFK

## Parent

[Effect server hardening PRD](../prds/effect-server-hardening.md)

## What to build

Replace the fourteen near-identical `Effect.catchTags({ NotFound: Effect.die, Rejected: Effect.die })` blocks in the application services with a single `dieOn(...tags)` combinator. The combinator's type narrows `Tags` against the input error union's `_tag` literal so misspellings are compile errors.

Concretely:

- **New `src/server/lib/die-on.ts`**:
  - `dieOn<Tags extends string>(...tags: Tags[])` returns an Effect combinator `<A, E extends { _tag: string }, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, Exclude<E, { _tag: Tags }>, R>` that wraps `Effect.catchTags(...)` with `Effect.die` for each listed tag.
  - The `Tags extends E['_tag']` constraint is enforced via the returned function's generic, so `dieOn('NotFOund')` (typo) at a call site whose error union is `Unauthorized | NotFound | Rejected` produces a TypeScript compile error.
- **New `src/server/lib/die-on.test.ts`** — three cases:
  - Tag in the demote list → effect dies (`Exit.isDie` returns `true`).
  - Tag not in the demote list → effect fails with the original tagged error (assert via `Effect.flip`).
  - Success effect → passes through unchanged.
- **Apply at all 14 call sites** (replace each `.pipe(Effect.catchTags({ NotFound: Effect.die, Rejected: Effect.die }))` with `.pipe(dieOn('NotFound', 'Rejected'))`, or whichever subset is at that site):
  - `contexts/board/application/load-board.ts` (1)
  - `contexts/board/application/load-mr-statuses.ts` (3)
  - `contexts/detail/application/load-issue.ts` (2)
  - `contexts/detail/application/load-transitions.ts` (1)
  - `contexts/detail/application/perform-transition.ts` — keep the existing `Effect.catchTag('NotFound', () => Effect.fail(new JiraRejected(...)))`; that's a _re-raise as a different tag_, not a demotion. Out of scope for `dieOn`.
  - `contexts/capture/application/load-myself.ts` (1)
  - `contexts/capture/application/load-my-epics.ts` (1)
  - `contexts/capture/application/quick-create.ts` (2)
  - `contexts/review/application/load-review-cards.ts` (3)
  - `server-functions/review.ts` (the inline `getGitlabUserProgram`, 1 site)

## Acceptance criteria

- [ ] `src/server/lib/die-on.ts` exports `dieOn` with the documented type-narrowed signature.
- [ ] `src/server/lib/die-on.test.ts` covers tag-demoted, tag-propagated, success-passthrough.
- [ ] All 14 call sites listed migrated to `dieOn`. No `Effect.catchTags({ … : Effect.die … })` blocks remain in `src/server/contexts/` or `src/server/server-functions/`.
- [ ] `perform-transition.ts`'s re-raise-as-different-tag pattern is preserved (not migrated).
- [ ] Misspelling a tag at a call site produces a compile error.
- [ ] All existing application-service tests pass unchanged.
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm test` all green.

## Blocked by

None — can start immediately.

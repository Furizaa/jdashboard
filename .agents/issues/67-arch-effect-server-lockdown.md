# 67 — Effect server: lockdown (delete old, rules to `error`)

**Type:** AFK

## Parent

[Effect server refactor PRD](../prds/effect-server-refactor.md)

## What to build

After 63–66 land, every server-side handler is served by the new `src/server/{gateways, contexts, server-functions}/` paths and the old `src/server/{jira, gitlab}/` folders are fully orphaned. This slice deletes them, retires the obsolete `getServerEnv()` lazy singleton, brings every server-specific `dependency-cruiser` rule that has been graduated to its final `error` severity, and regenerates `docs/architecture.svg` against the as-merged shape.

After this slice merges, master is the architecture's final shape: no parallel old-paths, no orphans, no graduated exceptions remaining.

Concretely:

- **Delete old gateway/service folders.**
  - `src/server/jira/{gateway, http-gateway, issue-service, config}.ts` and any sibling test files (`http-gateway.test.ts`, `issue-service.test.ts`) — verified-orphaned after 63–65.
  - `src/server/gitlab/{gateway, http-gateway, mr-service, review-service, mr-key-map, mr-status}.ts` and any sibling test files — verified-orphaned after 66.
  - The empty `src/server/jira/`, `src/server/gitlab/` directories themselves removed.
- **Retire `getServerEnv()` lazy singleton.** `src/server/env.ts`'s exported `getServerEnv` function is deleted; the validation logic was already mirrored into `ServerEnvLive` in slice 62. Only the type export `ServerEnv` survives if it has remaining consumers (most likely _not_ — all consumers should now `yield* ServerEnv` from a Tag). If `env.ts` is empty after the deletion, delete the file.
- **Confirm `JiraResult<T>` and `GitlabResult<T>` types are gone.** They lived in the deleted gateway files. A repo-wide grep should return no matches.
- **Tighten dependency-cruiser rules.**
  - `no-effect-on-client`, `no-neverthrow-on-server`, `no-cross-context-server`, `no-cross-gateway-adapter` — all already at `error` from 62. Confirm.
  - Add (if not yet present) a rule confirming gateway adapters import from `@effect/platform` — `gateway-adapter-must-import-effect-platform` was noted in PRD as "informational, becomes error at lockdown." Promote to `error` if it exists; otherwise drop the rule (its informational form was a planning aid; if every adapter naturally imports `@effect/platform`, the rule has nothing to enforce that the structural rules don't already cover).
  - Any graduated exceptions (warnings or skips) that have been carried through 63–66 are removed; rules apply to the whole `src/server/` tree at `error`.
- **Regenerate `docs/architecture.svg`.** `pnpm docs:arch` produces the as-merged graph; commit.
- **Tour/layers updates deferred to 68.**

## Acceptance criteria

- [ ] `src/server/jira/` no longer exists.
- [ ] `src/server/gitlab/` no longer exists.
- [ ] `src/server/env.ts` is deleted (or, if a residual type-only export survives, contains nothing else). `getServerEnv()` is no longer exported anywhere; `ServerEnv` is reachable only as the `Context.Tag` from `src/server/runtime/server-env.ts`.
- [ ] Repo-wide grep for `JiraResult<` and `GitlabResult<` returns zero matches.
- [ ] Repo-wide grep for `import .* from '~/server/jira` and `import .* from '~/server/gitlab'` returns zero matches.
- [ ] `.dependency-cruiser.cjs`'s server-specific rules are all at `error` severity. No graduated exceptions remain.
- [ ] `docs/architecture.svg` regenerated and committed; old `server/jira` / `server/gitlab` nodes are gone.
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test && pnpm test:e2e` all green.
- [ ] User-visible behaviour is identical (e2e is the gate).
- [ ] `pnpm fallow` reports zero unused files / dead exports in `src/server/`.

## Blocked by

- 64 — Effect server: Detail context migration
- 65 — Effect server: Capture context migration (Zod-at-boundary + Schema-internal lesson)
- 66 — Effect server: Review context migration (GitLab gateway + cross-system orchestration)

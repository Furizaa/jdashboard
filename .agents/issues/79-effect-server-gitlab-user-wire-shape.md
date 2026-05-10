# 79 — Effect server: unify `getGitlabUser` envelope with `WireResult`

**Type:** AFK

## Parent

[Effect server hardening PRD](../prds/effect-server-hardening.md)

## What to build

`getGitlabUser` is the only server-function returning a bespoke envelope (`{ ok: true, username, displayName }` / `{ ok: false, reason: 'unauthorized' }`) instead of the `WireResult` shape every other handler returns. Migrate it to `WireResult<{ username, displayName }, GitlabUnauthorizedWire>` so the wire vocabulary is one set of rules end-to-end, and update the single client caller.

Concretely:

- **Server-side** in `src/server/server-functions/review.ts`:
  - Drop the bespoke `GetGitlabUserResult` type.
  - Export `GetGitlabUserResult = WireResult<{ username: string; displayName: string }, GitlabUserOnlyErrorWire>`.
  - Drop the hand-translation in the handler (`if (wire.ok) return { ok: true, username, displayName }; return { ok: false, reason: 'unauthorized' }`). Just return the wire envelope directly. If slice 77 has merged first, use `runWire`; otherwise the inline `runPromise + InternalError throw` pattern stays for now.
- **Kernel-side**:
  - `~/kernel/gitlab.ts` re-exports server-function result types per CONTEXT-MAP.md. If `GetGitlabUserResult` is re-exported, the type identity changes; importers must compile against the new shape.
- **Client-side**:
  - Find the single caller of `getGitlabUser` (grep `getGitlabUser` in `src/contexts/`, `src/coordinator/`, `src/widgets/`, `src/routes/`, `src/kernel/`).
  - Replace the destructure of `{ ok: true, username, displayName }` / `{ ok: false, reason: 'unauthorized' }` with the `WireResult` pattern used elsewhere in the codebase: match `wire.ok` → `wire.username` / `wire.displayName`, else `wire.error._tag === 'Unauthorized'`.
  - The user-visible auth-status surface (review page banner, wherever `getGitlabUser` is consumed) renders identically.

## Acceptance criteria

- [ ] `getGitlabUser` returns `WireResult<{ username, displayName }, GitlabUserOnlyErrorWire>`.
- [ ] No remaining bespoke `{ ok: true, username, displayName } | { ok: false, reason: 'unauthorized' }` definition.
- [ ] The single client caller consumes the unified `WireResult` shape.
- [ ] Auth-status surfaces still display correctly (manual verification: signed-in state shows username; signed-out state shows the unauthorized banner).
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm test && pnpm test:e2e` all green.

## Blocked by

None — can start immediately. (Slice 77 is recommended for cleanly applying `runWire`; if 77 has not merged, the handler keeps the inline pattern just for `getGitlabUser`.)

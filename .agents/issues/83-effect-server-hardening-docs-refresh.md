# 83 — Effect server: documentation refresh after hardening pass

**Type:** AFK

## Parent

[Effect server hardening PRD](../prds/effect-server-hardening.md)

## What to build

Bring CONTEXT-MAP.md, ADR-0005, and the per-context `CONTEXT.md` files into agreement with the post-hardening codebase. Three claims either become accurate after slices 75–82 land (Schema-validated bodies, "concurrency 5 at app-service level") or grow new vocabulary (`TransportError` joins the wire error taxonomy). This is the doc-drift closer.

Per the parent PRD's recommendation, ADR-0005 is amended **in place** with a dated "Phase-1 follow-up" section rather than being superseded by a separate ADR — the original narrative stands; the follow-up frames the work as the policy menu's upgrade path being exercised.

Concretely:

- **`CONTEXT-MAP.md`** — three line-level edits in the "Server architecture (Effect-TS pass)" section:
  1. **Server-side libraries table** — the "Schema (server-internal)" row's Rule column updates to read along the lines of _"HTTP response shapes via `HttpClientResponse.schemaBodyJson`; internal codecs; tagged-error encoders."_ Make the implementation match the rule (was aspirational pre-81/82).
  2. **Wire error taxonomy** — wherever `Unauthorized` / `NotFound` / `Rejected` is enumerated, add `TransportError` and a one-line distinction: _"`Rejected` = upstream returned 4xx with a body; `TransportError` = network failure, request encoding failure, or response decode failure."_
  3. **Concurrency policy line** — verify the existing "Concurrency: `Effect.all(arr, { concurrency: 5 })` at the application-service level for fan-outs" line is now accurate after slice 80. If any prose elsewhere quotes a different in-flight number ("up to 20 concurrent requests" or similar — none expected), correct it.
- **`docs/adr/0005-effect-server-architecture.md`** — append a new section at the end:
  - **Heading**: `## Phase-1 follow-up — Schema bodies, transport-error split, concurrency parity (YYYY-MM-DD)`. Use the date the slice merges.
  - **Body** (a few short paragraphs):
    - Frame as the policy menu's upgrade path being exercised, not a correction to the original ADR.
    - Enumerate the concrete changes: Schema-validated HTTP bodies via `HttpClientResponse.schemaBodyJson`; `TransportError` introduced as a peer of `Rejected`; `mr-fanout`'s inner concurrency capped at 1 so the documented "5 at the app-service level" matches the runtime; one-line annotation on the `Schedule.compose(Schedule.recurs(N))` retry-cap pattern; new `runWire` helper at the server-function boundary; new `dieOn` combinator for tag demotion; `assertIssueKey` validator at the server-function input boundary.
    - Reference the new wire error taxonomy (the `Rejected` / `TransportError` distinction).
    - Cross-link to the slice issues (75–82) for the implementation paper trail.
- **`docs/adr/0006-binary-stream-api-routes.md`** — visual scan only; no expected change. Confirm in PR review that no claim about `Rejected` semantics breaks (the binary route maps `MediaResolutionError`, not `Rejected`, so it should be unaffected).
- **`README.md`** — visual scan only. Flag in PR if anything drifts (none expected — README is high-level).
- **Per-context `CONTEXT.md`** files under `src/server/contexts/<name>/`:
  - Scan each for sentences naming `Rejected` as the catch-all transport-error tag.
  - **`contexts/capture/CONTEXT.md`** — update the wire-error enumeration for `quickCreate` and `performTransition` (per slice 80) to read `Unauthorized | Rejected | TransportError`. The other Capture flows (`loadMyself`, `loadMyEpics`) demote `TransportError`; mention the demotion explicitly so the next reader knows which paths surface what.
  - **`contexts/board/CONTEXT.md`**, **`contexts/detail/CONTEXT.md`**, **`contexts/review/CONTEXT.md`** — verify each describes its wire error union accurately. `loadIssue` / `loadTransitions` retain their existing `Unauthorized | NotFound` shape; add a line noting that `Rejected` and `TransportError` are demoted to defects (and why — the JQL is server-built or the path is read-only, so a transport blip becomes a "Sync failed" via react-query rather than a tagged failure).
- **`docs/architecture.svg`** — does not change (no `dependency-cruiser` rule changes).
- **End-to-end consistency check**: read CONTEXT-MAP.md → ADR-0005 (original + follow-up) → per-context `CONTEXT.md` → `gateways/*/errors.ts` → `contexts/*/errors.ts` in one pass. Every sentence describing the wire taxonomy should agree.

## Acceptance criteria

- [ ] CONTEXT-MAP.md's "Schema (server-internal)" libraries-table row reflects the implemented `HttpClientResponse.schemaBodyJson` pattern.
- [ ] CONTEXT-MAP.md's wire error taxonomy enumerates `TransportError` alongside `Unauthorized` / `NotFound` / `Rejected`, with the `Rejected` / `TransportError` distinction documented.
- [ ] CONTEXT-MAP.md's concurrency claim ("5 at the application-service level") is consistent with the post-80 runtime (no prose anywhere quotes a different in-flight number).
- [ ] `docs/adr/0005-effect-server-architecture.md` ends with a dated "Phase-1 follow-up — Schema bodies, transport-error split, concurrency parity" section covering all the listed changes and cross-linking to slices 75–82.
- [ ] No remaining sentence in any per-context `CONTEXT.md` describes `Rejected` as the catch-all transport-class tag.
- [ ] `contexts/capture/CONTEXT.md` explicitly enumerates the wire error union for `quickCreate` (and `performTransition`) as `Unauthorized | Rejected | TransportError` and documents which other Capture flows demote `TransportError`.
- [ ] Each of the four per-context `CONTEXT.md` files describes its wire error union accurately and explicitly names the demotion policy where applicable.
- [ ] `README.md` and `docs/adr/0006-binary-stream-api-routes.md` were visually scanned and either confirmed unaffected or updated.
- [ ] End-to-end consistency check passes: every sentence about the wire taxonomy across CONTEXT-MAP, ADR-0005, per-context CONTEXT.md, and `errors.ts` agrees.
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm test && pnpm test:e2e` all green (no code changes; checks confirm nothing accidentally broken).

## Blocked by

- 75 — JQL safety helper + `assertIssueKey` at the boundary
- 76 — `dieOn` combinator
- 77 — `runWire` helper
- 78 — Polymorphic `notImpl` in fake gateways
- 79 — `getGitlabUser` wire-shape unification
- 80 — `TransportError` + concurrency cap + `Schedule.compose` comment
- 81 — Schema-validated HTTP bodies (Jira)
- 82 — Schema-validated HTTP bodies (GitLab)

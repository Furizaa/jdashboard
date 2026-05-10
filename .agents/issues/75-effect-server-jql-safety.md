# 75 — Effect server: JQL safety helper + `assertIssueKey` at the boundary

**Type:** AFK

## Parent

[Effect server hardening PRD](../prds/effect-server-hardening.md)

## What to build

Close the JQL injection surface in `loadIssue` and consolidate three local copies of `quoteJqlString` into one shared helper. Tighten the server-function input boundary so an issue-key string actually has to look like a Jira issue key.

Concretely:

- **New `src/server/lib/jql.ts`** with two pure exports:
  - `quoteJqlString(value: string): string` — wraps in `"…"`, escapes backslash then double-quote. Identical behaviour to today's three local copies in `contexts/board/application/load-board.ts`, `contexts/capture/application/load-my-epics.ts`, `contexts/review/application/load-review-cards.ts`.
  - `assertIssueKey(value: string, label: string): string` — pattern `/^[A-Z][A-Z0-9]+-[1-9]\d*$/`. Throws `Error(\`\${label}: invalid issue key "\${value}"\`)` on mismatch, returns the input on match. The pattern is documented at the definition site.
- **New `src/server/lib/jql.test.ts`** — table-driven cases:
  - `quoteJqlString`: empty, embedded `"`, embedded `\`, both, plain identifier.
  - `assertIssueKey`: canonical `HDR-1`, multi-letter prefix `HDR42-9999`, leading-zero rejected (`HDR-0`), lowercase rejected, embedded whitespace rejected, empty rejected, returns input unchanged on match.
- **Apply `quoteJqlString`**:
  - `contexts/board/application/load-board.ts` — drop local `quoteJqlString`; import from `~/server/lib/jql`.
  - `contexts/capture/application/load-my-epics.ts` — same.
  - `contexts/review/application/load-review-cards.ts` — same.
  - `contexts/detail/application/load-issue.ts` — replace `parent = "${key}"` (line 201) with `parent = ${quoteJqlString(key)}`.
- **Apply `assertIssueKey`** at the server-function boundary in `src/server/server-functions/detail.ts`:
  - Replace the existing `requireKey` helper with a thin wrapper over `assertIssueKey` (or call `assertIssueKey` directly inside each `inputValidator`).
  - `getIssue`, `getTransitions`, `transitionIssue` validators all reject inputs that don't match the issue-key pattern.
  - The thrown Error becomes the input-validation error TanStack Start surfaces as a 4xx — same shape as today's "key is required" path, just with a more specific message.

## Acceptance criteria

- [ ] `src/server/lib/jql.ts` exports `quoteJqlString` and `assertIssueKey` with the documented signatures and the regex pattern documented inline.
- [ ] `src/server/lib/jql.test.ts` covers all listed cases for both functions.
- [ ] No remaining local `quoteJqlString` declaration in `src/server/contexts/`. All three sites import from `~/server/lib/jql`.
- [ ] `loadIssue`'s sub-issue JQL uses `quoteJqlString(key)` for the parent key.
- [ ] `requireKey` in `server-functions/detail.ts` is replaced by `assertIssueKey` (directly or via a thin wrapper).
- [ ] `getIssue`, `getTransitions`, `transitionIssue` validators reject `"hdr-1"`, `"HDR-0"`, `"HDR"`, `""`, `" HDR-1 "` (after the existing trim) with the new "invalid issue key" message.
- [ ] All existing tests still green; new helper tests added.
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm test && pnpm test:e2e` all green.

## Blocked by

None — can start immediately.

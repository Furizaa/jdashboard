# 23 — MR CI/conflict indicator on Code Review row

**Type:** AFK

## Parent

[Misc improvements PRD](../prds/misc-improvements.md)

## What to build

A single CI/conflict status indicator on the right of the reviewer row, before the unresolved-comments chip. Encapsulates pipeline status and conflict state into one slot using a precedence rule.

- Extend `src/server/gitlab/client.ts`:
  - Extend `GitlabMrDetail` (and the underlying GitLab response shape) with `head_pipeline: { status: string } | null` and `has_conflicts: boolean`. No new endpoints — both fields come back from the existing `getMr` call.
- New pure module `src/features/mr-status/ci-state.ts`:
  - Public function `ciVisualState({ headPipelineStatus, hasConflicts })` returning `'conflict' | 'failed' | 'running' | 'passed' | 'none'`.
  - Precedence: `hasConflicts === true` → `'conflict'`; pipeline status `'failed'` or `'canceled'` → `'failed'`; pipeline status `'running'` or `'pending'` → `'running'`; pipeline status `'success'` → `'passed'`; otherwise (`null`, `'skipped'`, unknown values) → `'none'`.
- Extend `src/server/gitlab/mr-status.ts`:
  - Add a `ciState: 'conflict' | 'failed' | 'running' | 'passed' | 'none'` field on the `'review'` variant of the `MrSummary` discriminated union.
  - Compute it via `ciVisualState` inside `summarizeMr` for the `'review'` branch only. The `'merged'`, `'draft'`, and `'no-reviewers'` variants are unchanged — they deliberately do not carry `ciState`.
- New `src/features/mr-status/MrCiIndicator.tsx`:
  - Tiny component taking `state: 'conflict' | 'failed' | 'running' | 'passed' | 'none'`.
  - Renders nothing for `'none'`.
  - Renders a lucide icon for the other four:
    - `'conflict'` → `AlertTriangle`, amber.
    - `'failed'` → `XCircle`, red.
    - `'running'` → `Loader2`, muted, with a subtle spin animation (Tailwind `animate-spin`).
    - `'passed'` → `CheckCircle`, green.
  - Native `title` tooltip with a human-readable label (`"Merge conflict"`, `"CI failed"`, `"CI running"`, `"CI passed"`).
- Extend `src/features/mr-status/MrSection.tsx`:
  - On the `'review'` branch, render `<MrCiIndicator state={summary.ciState} />` immediately before the unresolved-count chip.
  - The slot is part of the same right-aligned cluster: avatars on the left, then `+N` chip, then CI indicator, then unresolved-count chip. Keep `ml-auto` on the first right-aligned element only.
  - On the `'merged'`, `'draft'`, `'no-reviewers'` warning rows: do not render the indicator (it is suppressed, per the PRD).
- Extend `src/features/mr-status/index.ts` to export `MrCiIndicator` and the `ciVisualState` function for reuse by slice 24.
- Tests (Vitest), colocated:
  - `ci-state.test.ts`:
    - Each `head_pipeline.status` value (`null`, `'success'`, `'running'`, `'pending'`, `'failed'`, `'canceled'`, `'skipped'`, an unknown string) crossed with `hasConflicts` true and false.
    - Conflict precedence: `hasConflicts: true` always returns `'conflict'`, regardless of pipeline status.
- Existing `mr-status.test.ts` is updated only minimally: any fixture that produces a `'review'` summary now also asserts the `ciState` field is populated. The existing precedence-rule assertions for `merged`/`draft`/`no-reviewers` are unchanged.
- Composition layers (`MrCiIndicator` rendering, `MrSection` extension) are manually verified per the PRD.

## Acceptance criteria

- [ ] Code Review cards with a matching open + non-draft + has-reviewers MR show a CI/conflict indicator on the right of the reviewer row, before the unresolved-comments chip.
- [ ] When the MR has a conflict (regardless of pipeline state), the indicator shows the amber `AlertTriangle`.
- [ ] When the MR has no conflict and the pipeline is failed or canceled, the indicator shows the red `XCircle`.
- [ ] When the MR has no conflict and the pipeline is running or pending, the indicator shows a muted spinning `Loader2`.
- [ ] When the MR has no conflict and the pipeline succeeded, the indicator shows the green `CheckCircle`.
- [ ] When the MR has no pipeline at all (`head_pipeline === null`) and no conflict, no indicator is rendered.
- [ ] Hovering the indicator shows a native `title` tooltip with a human-readable label.
- [ ] The indicator is suppressed on the merged, draft, and no-reviewers warning rows.
- [ ] The `MrSummary.review` type carries a `ciState` field; the other variants are unchanged.
- [ ] `ci-state.test.ts` covers the precedence rule across all pipeline values × `hasConflicts`.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

None — can start immediately.

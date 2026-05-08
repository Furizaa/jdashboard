# 48 — E2e: MR-status author-mode folder specs (introduces GitLab World + factories)

**Type:** AFK

## Parent

[E2e harness PRD](../prds/e2e-harness.md)

## What to build

Four scenario specs covering the MR-status (author-mode) feature folder, plus the GitLab side of the harness. This slice introduces every GitLab-side primitive the harness needs; slice 49 (review cards) consumes them.

- Extend `World` with GitLab state:
  - `seedMrs(mrs)`, `seedMrReviewers(iid, reviewers)`, `seedMrDiscussions(iid, discussions)`, `seedMrApprovals(iid, approvals)`, `seedMrPipeline(iid, pipeline)`.
  - `seedGitlabCurrentUser(user)`.
  - `getMr(iid)`, `getMrReviewers(iid)`, `getMrDiscussions(iid)`, `getMrApprovals(iid)`, `getGitlabCurrentUser()`.
  - `listMrsByAuthor(username)` — for the author-mode list call.
- Extend `tests/e2e/fixtures/`: `makeMr`, `makeMrReviewer`, `makeDiscussion`, `makeApprovals`, `makePipeline`, plus `makeUser` overload for GitLab user shape.
- Extend MSW handlers: `GET /api/v4/user`, `GET /api/v4/projects/:id/merge_requests`, `GET /api/v4/projects/:id/merge_requests/:iid`, `.../discussions`, `.../approvals`. Per-project ID is whatever the codebase uses.

Specs:

- `tests/e2e/mr-status/reviewer-row.spec.ts` — seed an issue in `In Code Review` with an MR having two reviewers (one with avatar, one without); assert both reviewer avatars render under the card's MR row; assert the per-reviewer state is encoded as the existing component expects.
- `tests/e2e/mr-status/ci-indicator.spec.ts` — seed an MR with each pipeline state (`success`, `failed`, `running`, `null`) and the conflict bit; assert the correct CI indicator icon renders per the misc-improvements PRD's precedence rule (conflict > failed > running > success > none). Hover, assert the native `title` tooltip text.
- `tests/e2e/mr-status/unresolved-threads.spec.ts` — seed an MR with a mix of resolvable/non-resolvable, resolved/unresolved discussions, including some authored by the current user; assert the unresolved-thread chip count matches the PRD rule (resolvable=true, resolved=false, first-note author ≠ current user).
- `tests/e2e/mr-status/warning-rows.spec.ts` — four cases in one spec: issue in `In Code Review` with no MR (no-MR warning), MR is draft (draft warning), MR has zero reviewers (no-reviewers warning), MR is merged but ticket is still in `In Code Review` (merged-desync warning). Assert each warning row renders correctly.
- Extend `src/lib/testids.ts` only as needed: `mrSection`, `reviewerAvatar`, `ciIndicator`, `unresolvedThreadChip`, `mrWarningRow` (plus a kind discriminator for the four warning types).
- No source-under-test changes beyond testid additions.

## Acceptance criteria

- [ ] All four specs pass on a clean checkout.
- [ ] CI indicator spec covers all four pipeline states *and* the conflict precedence — five cases in one spec.
- [ ] Unresolved-threads spec asserts the count rule precisely, including the "first-note author ≠ current user" exclusion.
- [ ] Warning-rows spec covers all four author-mode warning kinds in one cohesive spec; failure messages identify which kind broke.
- [ ] GitLab fixture factories produce JSON shapes matching the GitLab v4 API for the endpoints under use; verified by passing the harness against the existing app code unmodified.
- [ ] No structural CSS selectors. Testids added centrally.
- [ ] `pnpm typecheck` and `pnpm lint` pass.

## Blocked by

- 43 — E2e tracer bullet

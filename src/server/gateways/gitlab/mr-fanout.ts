import { Effect } from 'effect'
import type { GitlabUnauthorized } from './errors'
import type { GitlabGateway } from './port'
import type { RawApprovals, RawDiscussion, RawMrDetail, RawMrReviewerWithState } from './types'

export type MrBundle = {
  readonly detail: RawMrDetail
  readonly discussions: readonly RawDiscussion[]
  readonly approvals: RawApprovals
  readonly reviewers: readonly RawMrReviewerWithState[]
}

// NotFound / Rejected on a single MR drop that MR but keep the rest;
// Unauthorized propagates so the whole call surfaces as 401.
export const fetchMrBundle = (
  gitlab: GitlabGateway['Type'],
  iid: number,
): Effect.Effect<MrBundle | null, GitlabUnauthorized> =>
  Effect.all(
    [
      gitlab.getMr(iid),
      gitlab.getMrDiscussions(iid),
      gitlab.getMrApprovals(iid),
      gitlab.getMrReviewers(iid),
    ],
    { concurrency: 'unbounded' },
  ).pipe(
    Effect.map(
      ([detail, discussions, approvals, reviewers]): MrBundle => ({
        detail,
        discussions,
        approvals,
        reviewers,
      }),
    ),
    Effect.catchTags({
      NotFound: () => Effect.succeed(null),
      Rejected: () => Effect.succeed(null),
    }),
  )

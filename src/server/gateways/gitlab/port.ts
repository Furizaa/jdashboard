import { Context, type Effect } from 'effect'
import type { GitlabGatewayError } from './errors'
import type {
  GitlabUser,
  ListMrsQuery,
  RawApprovals,
  RawDiscussion,
  RawMrDetail,
  RawMrDiff,
  RawMrReviewerWithState,
  RawMrSummary,
} from './types'

export type GitlabGatewayShape = {
  readonly getCurrentUser: () => Effect.Effect<GitlabUser, GitlabGatewayError>
  readonly listMrs: (query: ListMrsQuery) => Effect.Effect<RawMrSummary[], GitlabGatewayError>
  readonly getMr: (iid: number) => Effect.Effect<RawMrDetail, GitlabGatewayError>
  readonly getMrDiscussions: (iid: number) => Effect.Effect<RawDiscussion[], GitlabGatewayError>
  /** Every file's diff in one merge request — the whole-diff expander's source. */
  readonly getMrDiffs: (iid: number) => Effect.Effect<RawMrDiff[], GitlabGatewayError>
  readonly getMrApprovals: (iid: number) => Effect.Effect<RawApprovals, GitlabGatewayError>
  readonly getMrReviewers: (
    iid: number,
  ) => Effect.Effect<RawMrReviewerWithState[], GitlabGatewayError>
}

export class GitlabGateway extends Context.Tag('GitlabGateway')<
  GitlabGateway,
  GitlabGatewayShape
>() {}

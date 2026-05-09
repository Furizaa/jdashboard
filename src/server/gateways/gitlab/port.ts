import { Context, type Effect } from 'effect'
import type { GitlabGatewayError } from './errors'
import type {
  GatewayUser,
  ListMrsQuery,
  RawApprovals,
  RawDiscussion,
  RawMrDetail,
  RawMrReviewerWithState,
  RawMrSummary,
} from './types'

export type GitlabGatewayShape = {
  readonly getCurrentUser: () => Effect.Effect<GatewayUser, GitlabGatewayError>
  readonly listMrs: (query: ListMrsQuery) => Effect.Effect<RawMrSummary[], GitlabGatewayError>
  readonly getMr: (iid: number) => Effect.Effect<RawMrDetail, GitlabGatewayError>
  readonly getMrDiscussions: (iid: number) => Effect.Effect<RawDiscussion[], GitlabGatewayError>
  readonly getMrApprovals: (iid: number) => Effect.Effect<RawApprovals, GitlabGatewayError>
  readonly getMrReviewers: (
    iid: number,
  ) => Effect.Effect<RawMrReviewerWithState[], GitlabGatewayError>
}

export class GitlabGateway extends Context.Tag('GitlabGateway')<
  GitlabGateway,
  GitlabGatewayShape
>() {}

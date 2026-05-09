import { Effect } from 'effect'
import { Rejected } from '../../../../gateways/gitlab/errors'
import type { GitlabGatewayShape } from '../../../../gateways/gitlab/port'

const notImpl = (label: string) =>
  Effect.die(new Error(`fake-gitlab-gateway: ${label} not implemented in this test`))

export function fakeGitlabGateway(overrides: Partial<GitlabGatewayShape>): GitlabGatewayShape {
  return {
    getCurrentUser: () => notImpl('getCurrentUser'),
    listMrs: () => notImpl('listMrs'),
    getMr: () => notImpl('getMr'),
    getMrDiscussions: () => notImpl('getMrDiscussions'),
    getMrApprovals: () => notImpl('getMrApprovals'),
    getMrReviewers: () => notImpl('getMrReviewers'),
    ...overrides,
  } as GitlabGatewayShape
}

export { Rejected }

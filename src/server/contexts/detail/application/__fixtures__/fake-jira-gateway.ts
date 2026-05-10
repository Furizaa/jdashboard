import { Effect } from 'effect'
import type { JiraGatewayShape } from '../../../../gateways/jira/port'

const notImpl = (label: string) =>
  Effect.die(new Error(`fake-jira-gateway: ${label} not implemented in this test`))

export function fakeJiraGateway(overrides: Partial<JiraGatewayShape>): JiraGatewayShape {
  return {
    getMyself: () => notImpl('getMyself'),
    searchIssues: () => notImpl('searchIssues'),
    getIssue: () => notImpl('getIssue'),
    getTransitions: () => notImpl('getTransitions'),
    transitionIssue: () => notImpl('transitionIssue'),
    createIssue: () => notImpl('createIssue'),
    getMediaMetadata: () => notImpl('getMediaMetadata'),
    streamMedia: () => notImpl('streamMedia'),
    ...overrides,
  } as JiraGatewayShape
}

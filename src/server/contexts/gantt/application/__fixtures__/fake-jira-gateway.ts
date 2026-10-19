import { Effect } from 'effect'
import type { JiraGatewayShape } from '../../../../gateways/jira/port'

// A local copy of the watchlist context's fake — a server bounded context cannot
// import another one, and the rule holds for fixtures as much as for production
// code. Small enough that the duplication beats a shared move, which is the
// judgement `load-watchlist-cards.ts` records about `toBoardIssue`.
//
// The polymorphic `notImpl` is the point: a test that forgets to stub a method
// gets a named defect rather than a `undefined is not a function`.

const notImpl = <A, E>(label: string): Effect.Effect<A, E> =>
  Effect.die(new Error(`fake-jira-gateway: ${label} not implemented in this test`))

export function fakeJiraGateway(overrides: Partial<JiraGatewayShape>): JiraGatewayShape {
  return {
    getMyself: () => notImpl('getMyself'),
    searchIssues: () => notImpl('searchIssues'),
    getIssue: () => notImpl('getIssue'),
    getTransitions: () => notImpl('getTransitions'),
    getIssueChangelog: () => notImpl('getIssueChangelog'),
    transitionIssue: () => notImpl('transitionIssue'),
    createIssue: () => notImpl('createIssue'),
    streamMedia: () => notImpl('streamMedia'),
    ...overrides,
  }
}

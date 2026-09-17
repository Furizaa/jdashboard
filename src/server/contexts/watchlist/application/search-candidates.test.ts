import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { JiraUnauthorized } from '../../../gateways/jira/errors'
import { JiraGateway } from '../../../gateways/jira/port'
import { WatchlistConfig, type WatchlistConfigShape } from '../config'
import { fakeJiraGateway } from './__fixtures__/fake-jira-gateway'
import { searchCandidates } from './search-candidates'

const config: WatchlistConfigShape = {
  baseUrl: 'https://example.atlassian.net',
  hideLabels: [],
}

function provide<A, E>(
  program: Effect.Effect<A, E, JiraGateway | WatchlistConfig>,
  jira: ReturnType<typeof fakeJiraGateway>,
): Effect.Effect<A, E, never> {
  return program.pipe(
    Effect.provide(
      Layer.mergeAll(Layer.succeed(JiraGateway, jira), Layer.succeed(WatchlistConfig, config)),
    ),
  )
}

describe('searchCandidates', () => {
  it('returns empty candidates without calling Jira for blank text', () =>
    Effect.gen(function* () {
      let called = false
      const jira = fakeJiraGateway({
        searchIssues: () => {
          called = true
          return Effect.succeed({ issues: [] })
        },
      })
      const result = yield* provide(searchCandidates('   '), jira)
      expect(called).toBe(false)
      expect(result.candidates).toEqual([])
    }))

  it('builds a candidate JQL and maps issues to lightweight candidates', () =>
    Effect.gen(function* () {
      let capturedJql: string | undefined
      const jira = fakeJiraGateway({
        searchIssues: (jql) => {
          capturedJql = jql
          return Effect.succeed({
            issues: [
              {
                id: '1',
                key: 'ABC-9',
                fields: {
                  summary: 'Cross-project ticket',
                  status: { name: 'In Progress' },
                  issuetype: { name: 'Story' },
                },
              },
            ],
          })
        },
      })
      const result = yield* provide(searchCandidates('cross'), jira)
      expect(capturedJql).toBe('(summary ~ "cross*") ORDER BY updated DESC')
      expect(result.candidates).toEqual([
        {
          key: 'ABC-9',
          summary: 'Cross-project ticket',
          statusName: 'In Progress',
          typeName: 'Story',
        },
      ])
    }))

  it('propagates Unauthorized as a tagged failure', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({ searchIssues: () => Effect.fail(new JiraUnauthorized()) })
      const failure = yield* provide(searchCandidates('cross'), jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Unauthorized')
    }))
})

import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { JiraUnauthorized } from '../../../gateways/jira/errors'
import { JiraGateway } from '../../../gateways/jira/port'
import { WatchlistConfig, type WatchlistConfigShape } from '../config'
import { fakeJiraGateway } from './__fixtures__/fake-jira-gateway'
import { loadWatchlistCards } from './load-watchlist-cards'

const config: WatchlistConfigShape = {
  baseUrl: 'https://example.atlassian.net',
  hideLabels: ['internal'],
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

describe('loadWatchlistCards', () => {
  it('returns empty cards without calling Jira when there are no keys', () =>
    Effect.gen(function* () {
      let called = false
      const jira = fakeJiraGateway({
        searchIssues: () => {
          called = true
          return Effect.succeed({ issues: [] })
        },
      })
      const result = yield* provide(loadWatchlistCards([]), jira)
      expect(called).toBe(false)
      expect(result).toEqual({ baseUrl: config.baseUrl, cards: [] })
    }))

  it('builds a key-in JQL, maps issues to cards, and applies hideLabels', () =>
    Effect.gen(function* () {
      let capturedJql: string | undefined
      const jira = fakeJiraGateway({
        searchIssues: (jql) => {
          capturedJql = jql
          return Effect.succeed({
            issues: [
              {
                id: '1',
                key: 'HDR-1',
                fields: {
                  summary: 'Advise on this',
                  status: { name: 'In Code Review' },
                  labels: ['Internal', 'keep'],
                },
              },
            ],
          })
        },
      })
      const result = yield* provide(loadWatchlistCards(['HDR-1']), jira)
      expect(capturedJql).toBe('key in ("HDR-1") ORDER BY updated DESC')
      expect(result.cards).toEqual([
        {
          key: 'HDR-1',
          summary: 'Advise on this',
          statusName: 'In Code Review',
          typeName: 'Task',
          labels: ['keep'],
          epic: null,
        },
      ])
    }))

  it('propagates Unauthorized as a tagged failure', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({ searchIssues: () => Effect.fail(new JiraUnauthorized()) })
      const failure = yield* provide(loadWatchlistCards(['HDR-1']), jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Unauthorized')
    }))
})

import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { Unauthorized } from '../../../gateways/jira/errors'
import { JiraGateway } from '../../../gateways/jira/port'
import type { RawSearchResponse } from '../../../gateways/jira/types'
import { CaptureConfig, type CaptureConfigShape } from '../config'
import { fakeJiraGateway } from './__fixtures__/fake-jira-gateway'
import { loadMyEpics } from './load-my-epics'

const baseConfig: CaptureConfigShape = {
  baseUrl: 'https://example.atlassian.net',
  projectKey: 'HDR',
  quickCreate: { summaryPrefix: '[FE]: ', labels: ['Frontend'], priority: 'Lowest' },
  epic: { statuses: ['In Progress'] },
}

function provide<A, E>(
  program: Effect.Effect<A, E, JiraGateway | CaptureConfig>,
  jira: ReturnType<typeof fakeJiraGateway>,
  config: CaptureConfigShape = baseConfig,
): Effect.Effect<A, E, never> {
  return program.pipe(
    Effect.provide(
      Layer.mergeAll(Layer.succeed(JiraGateway, jira), Layer.succeed(CaptureConfig, config)),
    ),
  )
}

function emptySearchResponse(): RawSearchResponse {
  return { issues: [] }
}

describe('loadMyEpics', () => {
  it.effect('builds JQL from config and forwards it to searchIssues (single status)', () => {
    let capturedJql: string | undefined
    const jira = fakeJiraGateway({
      searchIssues: (jql) => {
        capturedJql = jql
        return Effect.succeed(emptySearchResponse())
      },
    })
    return provide(loadMyEpics, jira).pipe(
      Effect.tap(() => {
        expect(capturedJql).toBe(
          'issuetype = Epic AND assignee = currentUser() AND status = "In Progress" AND project = "HDR"',
        )
      }),
    )
  })

  it.effect('wraps multiple statuses in parentheses joined by OR', () => {
    let capturedJql: string | undefined
    const jira = fakeJiraGateway({
      searchIssues: (jql) => {
        capturedJql = jql
        return Effect.succeed(emptySearchResponse())
      },
    })
    return provide(loadMyEpics, jira, {
      ...baseConfig,
      epic: { statuses: ['In Progress', 'In Review'] },
    }).pipe(
      Effect.tap(() => {
        expect(capturedJql).toContain('(status = "In Progress" OR status = "In Review")')
      }),
    )
  })

  it.effect('shapes search response into EpicRefs', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        searchIssues: () =>
          Effect.succeed({
            issues: [
              {
                id: '1',
                key: 'HDR-100',
                fields: { summary: 'Epic A', status: { name: 'In Progress' } },
              },
              {
                id: '2',
                key: 'HDR-200',
                fields: { summary: 'Epic B', status: { name: 'In Progress' } },
              },
            ],
          }),
      })
      const result = yield* provide(loadMyEpics, jira)
      expect(result.epics).toEqual([
        { key: 'HDR-100', summary: 'Epic A' },
        { key: 'HDR-200', summary: 'Epic B' },
      ])
    }),
  )

  it.effect('propagates Unauthorized as a tagged failure', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        searchIssues: () => Effect.fail(new Unauthorized()),
      })
      const failure = yield* provide(loadMyEpics, jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Unauthorized')
    }),
  )
})

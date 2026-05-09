import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { Unauthorized } from '../../../gateways/jira/errors'
import { JiraGateway } from '../../../gateways/jira/port'
import type { RawSearchResponse } from '../../../gateways/jira/types'
import { BoardConfig, type BoardConfigShape } from '../config'
import { fakeJiraGateway } from './__fixtures__/fake-jira-gateway'
import { loadBoard } from './load-board'

const baseConfig: BoardConfigShape = {
  baseUrl: 'https://example.atlassian.net',
  projectKey: 'HDR',
  labelFilter: 'Frontend',
  hideLabels: ['internal'],
  doneWindowDays: 14,
}

function provide<A, E>(
  program: Effect.Effect<A, E, JiraGateway | BoardConfig>,
  jira: ReturnType<typeof fakeJiraGateway>,
  config: BoardConfigShape = baseConfig,
): Effect.Effect<A, E, never> {
  return program.pipe(
    Effect.provide(
      Layer.mergeAll(Layer.succeed(JiraGateway, jira), Layer.succeed(BoardConfig, config)),
    ),
  )
}

function emptySearchResponse(): RawSearchResponse {
  return { issues: [] }
}

describe('loadBoard', () => {
  it.effect('builds JQL from config and forwards it to searchIssues', () => {
    let capturedJql: string | undefined
    const jira = fakeJiraGateway({
      searchIssues: (jql) => {
        capturedJql = jql
        return Effect.succeed(emptySearchResponse())
      },
    })
    return provide(loadBoard, jira).pipe(
      Effect.tap(() => {
        expect(capturedJql).toBe(
          'project = HDR AND assignee = currentUser() AND labels = "Frontend" AND (statusCategory != Done OR status changed to Done after -14d) ORDER BY rank',
        )
      }),
    )
  })

  it.effect('escapes embedded double quotes and backslashes in the labelFilter', () => {
    let capturedJql: string | undefined
    const jira = fakeJiraGateway({
      searchIssues: (jql) => {
        capturedJql = jql
        return Effect.succeed(emptySearchResponse())
      },
    })
    return provide(loadBoard, jira, { ...baseConfig, labelFilter: 'a"b\\c' }).pipe(
      Effect.tap(() => {
        expect(capturedJql).toContain('labels = "a\\"b\\\\c"')
      }),
    )
  })

  it.effect('applies hideLabels filter case-insensitively and surfaces baseUrl', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        searchIssues: () =>
          Effect.succeed({
            issues: [
              {
                id: '1',
                key: 'HDR-1',
                fields: {
                  summary: 's',
                  status: { name: 'To Do' },
                  labels: ['Frontend', 'Internal', 'keep-me'],
                },
              },
            ],
          }),
      })
      const result = yield* provide(loadBoard, jira)
      expect(result.baseUrl).toBe('https://example.atlassian.net')
      expect(result.issues[0]?.labels).toEqual(['Frontend', 'keep-me'])
    }),
  )

  it.effect('shapes parent into epic when parent.issuetype is Epic', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        searchIssues: () =>
          Effect.succeed({
            issues: [
              {
                id: '1',
                key: 'HDR-1',
                fields: {
                  summary: 's',
                  status: { name: 'To Do' },
                  parent: {
                    key: 'HDR-100',
                    fields: { summary: 'My Epic', issuetype: { name: 'Epic' } },
                  },
                },
              },
              {
                id: '2',
                key: 'HDR-2',
                fields: {
                  summary: 's2',
                  status: { name: 'To Do' },
                  parent: { key: 'HDR-200', fields: { issuetype: { name: 'Story' } } },
                },
              },
            ],
          }),
      })
      const result = yield* provide(loadBoard, jira)
      expect(result.issues[0]?.epic).toEqual({ key: 'HDR-100', summary: 'My Epic' })
      expect(result.issues[1]?.epic).toBeNull()
    }),
  )

  it.effect('propagates Unauthorized as a tagged failure', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        searchIssues: () => Effect.fail(new Unauthorized()),
      })
      const failure = yield* provide(loadBoard, jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Unauthorized')
    }),
  )
})

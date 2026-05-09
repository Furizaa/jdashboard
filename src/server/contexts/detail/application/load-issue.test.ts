import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { NotFound, Unauthorized } from '../../../gateways/jira/errors'
import { JiraGateway } from '../../../gateways/jira/port'
import type { RawDetailedIssue, RawSearchResponse } from '../../../gateways/jira/types'
import { DetailConfig, type DetailConfigShape } from '../config'
import { fakeJiraGateway } from './__fixtures__/fake-jira-gateway'
import { loadIssue } from './load-issue'

const baseConfig: DetailConfigShape = {
  baseUrl: 'https://example.atlassian.net',
}

function provide<A, E>(
  program: Effect.Effect<A, E, JiraGateway | DetailConfig>,
  jira: ReturnType<typeof fakeJiraGateway>,
  config: DetailConfigShape = baseConfig,
): Effect.Effect<A, E, never> {
  return program.pipe(
    Effect.provide(
      Layer.mergeAll(Layer.succeed(JiraGateway, jira), Layer.succeed(DetailConfig, config)),
    ),
  )
}

function emptyDetailedIssue(key: string): RawDetailedIssue {
  return {
    id: 'id-' + key,
    key,
    fields: {
      summary: '',
      status: { name: 'To Do' },
    },
  }
}

function emptySearchResponse(): RawSearchResponse {
  return { issues: [] }
}

describe('loadIssue', () => {
  it.effect('fetches main issue and sub-issues and shapes linked refs', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        getIssue: () =>
          Effect.succeed<RawDetailedIssue>({
            id: '1',
            key: 'HDR-1',
            fields: {
              summary: 'main',
              status: { name: 'In Progress' },
              issuetype: { name: 'Task' },
              parent: {
                key: 'HDR-99',
                fields: {
                  summary: 'parent epic',
                  issuetype: { name: 'Epic' },
                  status: {
                    name: 'In Progress',
                    statusCategory: { key: 'indeterminate', name: 'In Progress' },
                  },
                },
              },
              issuelinks: [
                {
                  id: 'l1',
                  type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
                  outwardIssue: {
                    key: 'HDR-200',
                    fields: {
                      summary: 'blocked one',
                      issuetype: { name: 'Bug' },
                      status: {
                        name: 'Done',
                        statusCategory: { key: 'done', name: 'Done' },
                      },
                    },
                  },
                },
              ],
            },
          }),
        searchIssues: () =>
          Effect.succeed({
            issues: [
              {
                id: '2',
                key: 'HDR-2',
                fields: {
                  summary: 'sub-1',
                  status: {
                    name: 'To Do',
                    statusCategory: { key: 'new', name: 'To Do' },
                  },
                  issuetype: { name: 'Sub-task' },
                },
              },
            ],
          }),
      })
      const result = yield* provide(loadIssue('HDR-1'), jira)
      expect(result.issue.parent).toEqual({
        key: 'HDR-99',
        summary: 'parent epic',
        typeName: 'Epic',
        statusName: 'In Progress',
        statusCategory: 'indeterminate',
      })
      expect(result.issue.subIssues).toEqual([
        {
          key: 'HDR-2',
          summary: 'sub-1',
          typeName: 'Sub-task',
          statusName: 'To Do',
          statusCategory: 'new',
        },
      ])
      expect(result.issue.links).toHaveLength(1)
      expect(result.issue.links[0]).toEqual({
        id: 'l1',
        typeName: 'Blocks',
        direction: 'outward',
        relationship: 'blocks',
        issue: {
          key: 'HDR-200',
          summary: 'blocked one',
          typeName: 'Bug',
          statusName: 'Done',
          statusCategory: 'done',
        },
      })
    }),
  )

  it.effect('queries sub-issues with the parent key in JQL', () => {
    let capturedSubJql: string | undefined
    const jira = fakeJiraGateway({
      getIssue: () => Effect.succeed(emptyDetailedIssue('HDR-1')),
      searchIssues: (jql) => {
        capturedSubJql = jql
        return Effect.succeed(emptySearchResponse())
      },
    })
    return provide(loadIssue('HDR-1'), jira).pipe(
      Effect.tap(() => {
        expect(capturedSubJql).toBe('parent = "HDR-1"')
      }),
    )
  })

  it.effect('exposes baseUrl from config on the result', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        getIssue: () => Effect.succeed(emptyDetailedIssue('HDR-1')),
        searchIssues: () => Effect.succeed(emptySearchResponse()),
      })
      const result = yield* provide(loadIssue('HDR-1'), jira)
      expect(result.baseUrl).toBe('https://example.atlassian.net')
    }),
  )

  it.effect('drops the priority "Undefined" sentinel to null (case-insensitive)', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        getIssue: () =>
          Effect.succeed<RawDetailedIssue>({
            id: '1',
            key: 'HDR-1',
            fields: {
              summary: '',
              status: { name: 'To Do' },
              priority: { name: 'Undefined' },
            },
          }),
        searchIssues: () => Effect.succeed(emptySearchResponse()),
      })
      const result = yield* provide(loadIssue('HDR-1'), jira)
      expect(result.issue.priorityName).toBeNull()
    }),
  )

  it.effect('keeps a real priority on the result', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        getIssue: () =>
          Effect.succeed<RawDetailedIssue>({
            id: '1',
            key: 'HDR-1',
            fields: {
              summary: '',
              status: { name: 'To Do' },
              priority: { name: 'High' },
            },
          }),
        searchIssues: () => Effect.succeed(emptySearchResponse()),
      })
      const result = yield* provide(loadIssue('HDR-1'), jira)
      expect(result.issue.priorityName).toBe('High')
    }),
  )

  it.effect('maps comment author avatar via the largest size with fallback', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        getIssue: () =>
          Effect.succeed<RawDetailedIssue>({
            id: '1',
            key: 'HDR-1',
            fields: {
              summary: '',
              status: { name: 'To Do' },
              comment: {
                comments: [
                  {
                    id: 'c1',
                    author: {
                      displayName: 'Jane',
                      avatarUrls: { '24x24': 'small.png', '48x48': 'big.png' },
                    },
                    created: '2024-01-01T00:00:00.000Z',
                  },
                  {
                    id: 'c2',
                    author: { displayName: 'John', avatarUrls: { '24x24': 'only-small.png' } },
                    created: '2024-01-02T00:00:00.000Z',
                  },
                ],
              },
            },
          }),
        searchIssues: () => Effect.succeed(emptySearchResponse()),
      })
      const result = yield* provide(loadIssue('HDR-1'), jira)
      expect(result.issue.comments[0]?.authorAvatarUrl).toBe('big.png')
      expect(result.issue.comments[1]?.authorAvatarUrl).toBe('only-small.png')
    }),
  )

  it.effect('propagates Unauthorized as a tagged failure', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        getIssue: () => Effect.fail(new Unauthorized()),
        searchIssues: () => Effect.succeed(emptySearchResponse()),
      })
      const failure = yield* provide(loadIssue('HDR-1'), jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Unauthorized')
    }),
  )

  it.effect('propagates NotFound from the main issue fetch as a tagged failure', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        getIssue: () => Effect.fail(new NotFound()),
        searchIssues: () => Effect.succeed(emptySearchResponse()),
      })
      const failure = yield* provide(loadIssue('HDR-NOPE'), jira).pipe(Effect.flip)
      expect(failure._tag).toBe('NotFound')
    }),
  )

  it.effect('propagates Unauthorized from the sub-issue fetch as a tagged failure', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        getIssue: () => Effect.succeed(emptyDetailedIssue('HDR-1')),
        searchIssues: () => Effect.fail(new Unauthorized()),
      })
      const failure = yield* provide(loadIssue('HDR-1'), jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Unauthorized')
    }),
  )
})

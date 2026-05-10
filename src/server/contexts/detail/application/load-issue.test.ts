import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { JiraNotFound, JiraUnauthorized } from '../../../gateways/jira/errors'
import { JiraGateway } from '../../../gateways/jira/port'
import type { AdfNode, RawDetailedIssue, RawSearchResponse } from '../../../gateways/jira/types'
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

  it.effect('requests the attachment field on the main issue fetch', () => {
    let capturedFields: readonly string[] = []
    const jira = fakeJiraGateway({
      getIssue: (_key, fields) => {
        capturedFields = fields
        return Effect.succeed(emptyDetailedIssue('HDR-1'))
      },
      searchIssues: () => Effect.succeed(emptySearchResponse()),
    })
    return provide(loadIssue('HDR-1'), jira).pipe(
      Effect.tap(() => {
        expect(capturedFields).toContain('attachment')
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
        getIssue: () => Effect.fail(new JiraUnauthorized()),
        searchIssues: () => Effect.succeed(emptySearchResponse()),
      })
      const failure = yield* provide(loadIssue('HDR-1'), jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Unauthorized')
    }),
  )

  it.effect('propagates NotFound from the main issue fetch as a tagged failure', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        getIssue: () => Effect.fail(new JiraNotFound()),
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
        searchIssues: () => Effect.fail(new JiraUnauthorized()),
      })
      const failure = yield* provide(loadIssue('HDR-1'), jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Unauthorized')
    }),
  )

  it.effect(
    'enriches description and comment-body media nodes whose alt filename matches an attachment, leaves others alone',
    () =>
      Effect.gen(function* () {
        const description: AdfNode = {
          type: 'doc',
          content: [
            { type: 'media', attrs: { id: 'uuid-desc-known', alt: 'pic.png' } },
            { type: 'media', attrs: { id: 'uuid-desc-unknown', alt: 'orphan.png' } },
          ],
        }
        const commentBody: AdfNode = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'media', attrs: { id: 'uuid-comment', alt: 'clip.mp4' } }],
            },
          ],
        }
        const jira = fakeJiraGateway({
          getIssue: () =>
            Effect.succeed<RawDetailedIssue>({
              id: '1',
              key: 'HDR-1',
              fields: {
                summary: 'with-media',
                status: { name: 'To Do' },
                description,
                attachment: [
                  { id: '10001', filename: 'pic.png', mimeType: 'image/png' },
                  { id: '10002', filename: 'clip.mp4', mimeType: 'video/mp4' },
                ],
                comment: {
                  comments: [
                    {
                      id: 'c1',
                      created: '2026-01-01T00:00:00.000Z',
                      body: commentBody,
                    },
                  ],
                },
              },
            }),
          searchIssues: () => Effect.succeed(emptySearchResponse()),
        })
        const result = yield* provide(loadIssue('HDR-1'), jira)
        const descContent = result.issue.description?.content
        expect(descContent?.[0]?.attrs?.url).toBe('/api/jira-media/10001')
        expect(descContent?.[0]?.attrs?.mimeType).toBe('image/png')
        expect(descContent?.[1]?.attrs?.url).toBeUndefined()
        const commentMedia = result.issue.comments[0]?.body?.content?.[0]?.content?.[0]
        expect(commentMedia?.attrs?.url).toBe('/api/jira-media/10002')
        expect(commentMedia?.attrs?.mimeType).toBe('video/mp4')
      }),
  )

  it.effect('still loads the issue (with no enrichment) when fields.attachment is absent', () =>
    Effect.gen(function* () {
      const description: AdfNode = {
        type: 'doc',
        content: [{ type: 'media', attrs: { id: 'uuid-1', alt: 'pic.png' } }],
      }
      const jira = fakeJiraGateway({
        getIssue: () =>
          Effect.succeed<RawDetailedIssue>({
            id: '1',
            key: 'HDR-1',
            fields: {
              summary: 'with-media',
              status: { name: 'To Do' },
              description,
            },
          }),
        searchIssues: () => Effect.succeed(emptySearchResponse()),
      })
      const result = yield* provide(loadIssue('HDR-1'), jira)
      const m = result.issue.description?.content?.[0]
      expect(m?.attrs?.alt).toBe('pic.png')
      expect(m?.attrs?.url).toBeUndefined()
    }),
  )
})

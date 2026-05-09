import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { JiraRejected, JiraUnauthorized } from '../../../gateways/jira/errors'
import { JiraGateway } from '../../../gateways/jira/port'
import type { CreateIssueBody } from '../../../gateways/jira/types'
import { CaptureConfig, type CaptureConfigShape } from '../config'
import { fakeJiraGateway } from './__fixtures__/fake-jira-gateway'
import { quickCreate } from './quick-create'
import type { QuickCreateInput } from './quick-create-schema'

const baseConfig: CaptureConfigShape = {
  baseUrl: 'https://example.atlassian.net',
  projectKey: 'HDR',
  quickCreate: { summaryPrefix: '[FE]: ', labels: ['Frontend'], priority: 'Lowest' },
  epic: { statuses: ['In Progress'] },
}

const SAMPLE_INPUT: QuickCreateInput = {
  type: 'Bug',
  parentKey: 'HDR-1',
  summary: 'broken',
  description: 'line one\nline two',
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

describe('quickCreate', () => {
  it.effect('returns the created key + baseUrl on success', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        getMyself: () =>
          Effect.succeed({ accountId: 'acc-1', displayName: 'A', avatarUrl: 'https://a' }),
        createIssue: () => Effect.succeed({ key: 'HDR-99' }),
      })
      const result = yield* provide(quickCreate(SAMPLE_INPUT), jira)
      expect(result).toEqual({ key: 'HDR-99', baseUrl: 'https://example.atlassian.net' })
    }),
  )

  it.effect(
    'forwards the assembled CreateIssueBody (prefixed summary, ADF description, accountId)',
    () =>
      Effect.gen(function* () {
        let capturedBody: CreateIssueBody | undefined
        const jira = fakeJiraGateway({
          getMyself: () =>
            Effect.succeed({ accountId: 'acc-1', displayName: 'A', avatarUrl: 'https://a' }),
          createIssue: (body) => {
            capturedBody = body
            return Effect.succeed({ key: 'HDR-99' })
          },
        })
        yield* provide(quickCreate(SAMPLE_INPUT), jira)
        expect(capturedBody).toBeDefined()
        const f = capturedBody!.fields
        expect(f.project).toEqual({ key: 'HDR' })
        expect(f.issuetype).toEqual({ name: 'Bug' })
        expect(f.summary).toBe('[FE]: broken')
        expect(f.priority).toEqual({ name: 'Lowest' })
        expect(f.labels).toEqual(['Frontend'])
        expect(f.parent).toEqual({ key: 'HDR-1' })
        expect(f.assignee).toEqual({ accountId: 'acc-1' })
        expect(f.description).toEqual({
          type: 'doc',
          version: 1,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'line one' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'line two' }] },
          ],
        })
      }),
  )

  it.effect('propagates Unauthorized when getMyself fails with Unauthorized', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        getMyself: () => Effect.fail(new JiraUnauthorized()),
      })
      const failure = yield* provide(quickCreate(SAMPLE_INPUT), jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Unauthorized')
    }),
  )

  it.effect('propagates Unauthorized when createIssue fails with Unauthorized', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        getMyself: () =>
          Effect.succeed({ accountId: 'acc-1', displayName: 'A', avatarUrl: 'https://a' }),
        createIssue: () => Effect.fail(new JiraUnauthorized()),
      })
      const failure = yield* provide(quickCreate(SAMPLE_INPUT), jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Unauthorized')
    }),
  )

  it.effect('propagates Rejected with the gateway message when createIssue is rejected', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        getMyself: () =>
          Effect.succeed({ accountId: 'acc-1', displayName: 'A', avatarUrl: 'https://a' }),
        createIssue: () => Effect.fail(new JiraRejected({ message: 'parent missing' })),
      })
      const failure = yield* provide(quickCreate(SAMPLE_INPUT), jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Rejected')
      if (failure._tag === 'Rejected') {
        expect(failure.message).toBe('parent missing')
      }
    }),
  )

  it.effect('propagates Rejected when getMyself is rejected', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        getMyself: () => Effect.fail(new JiraRejected({ message: 'service unavailable' })),
      })
      const failure = yield* provide(quickCreate(SAMPLE_INPUT), jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Rejected')
      if (failure._tag === 'Rejected') {
        expect(failure.message).toBe('service unavailable')
      }
    }),
  )
})

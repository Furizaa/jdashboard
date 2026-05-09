import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { JiraNotFound, JiraRejected, JiraUnauthorized } from '../../../gateways/jira/errors'
import { JiraGateway } from '../../../gateways/jira/port'
import { fakeJiraGateway } from './__fixtures__/fake-jira-gateway'
import { performTransition } from './perform-transition'

function provide<A, E>(
  program: Effect.Effect<A, E, JiraGateway>,
  jira: ReturnType<typeof fakeJiraGateway>,
): Effect.Effect<A, E, never> {
  return program.pipe(Effect.provide(Layer.succeed(JiraGateway, jira)))
}

describe('performTransition', () => {
  it.effect('forwards key and transitionId and succeeds on gateway success', () =>
    Effect.gen(function* () {
      let capturedKey: string | undefined
      let capturedTransitionId: string | undefined
      const jira = fakeJiraGateway({
        transitionIssue: (key, transitionId) => {
          capturedKey = key
          capturedTransitionId = transitionId
          return Effect.void
        },
      })
      yield* provide(performTransition('HDR-1', '21'), jira)
      expect(capturedKey).toBe('HDR-1')
      expect(capturedTransitionId).toBe('21')
    }),
  )

  it.effect('propagates Unauthorized as a tagged failure', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        transitionIssue: () => Effect.fail(new JiraUnauthorized()),
      })
      const failure = yield* provide(performTransition('HDR-1', '21'), jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Unauthorized')
    }),
  )

  it.effect('propagates Rejected with the gateway message', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        transitionIssue: () => Effect.fail(new JiraRejected({ message: 'Transition not allowed' })),
      })
      const failure = yield* provide(performTransition('HDR-1', '21'), jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Rejected')
      if (failure._tag === 'Rejected') {
        expect(failure.message).toBe('Transition not allowed')
      }
    }),
  )

  it.effect('translates NotFound from the gateway into Rejected with "Issue not found"', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        transitionIssue: () => Effect.fail(new JiraNotFound()),
      })
      const failure = yield* provide(performTransition('HDR-NOPE', '21'), jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Rejected')
      if (failure._tag === 'Rejected') {
        expect(failure.message).toBe('Issue not found')
      }
    }),
  )
})

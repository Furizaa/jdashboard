import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { NotFound, Unauthorized } from '../../../gateways/jira/errors'
import { JiraGateway } from '../../../gateways/jira/port'
import { fakeJiraGateway } from './__fixtures__/fake-jira-gateway'
import { loadTransitions } from './load-transitions'

function provide<A, E>(
  program: Effect.Effect<A, E, JiraGateway>,
  jira: ReturnType<typeof fakeJiraGateway>,
): Effect.Effect<A, E, never> {
  return program.pipe(Effect.provide(Layer.succeed(JiraGateway, jira)))
}

describe('loadTransitions', () => {
  it.effect('returns the gateway transitions on success', () =>
    Effect.gen(function* () {
      let capturedKey: string | undefined
      const jira = fakeJiraGateway({
        getTransitions: (key) => {
          capturedKey = key
          return Effect.succeed([{ id: '21', name: 'In Progress', toStatusName: 'In Progress' }])
        },
      })
      const result = yield* provide(loadTransitions('HDR-1'), jira)
      expect(capturedKey).toBe('HDR-1')
      expect(result.transitions).toEqual([
        { id: '21', name: 'In Progress', toStatusName: 'In Progress' },
      ])
    }),
  )

  it.effect('propagates Unauthorized as a tagged failure', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        getTransitions: () => Effect.fail(new Unauthorized()),
      })
      const failure = yield* provide(loadTransitions('HDR-1'), jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Unauthorized')
    }),
  )

  it.effect('propagates NotFound as a tagged failure', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        getTransitions: () => Effect.fail(new NotFound()),
      })
      const failure = yield* provide(loadTransitions('HDR-NOPE'), jira).pipe(Effect.flip)
      expect(failure._tag).toBe('NotFound')
    }),
  )
})

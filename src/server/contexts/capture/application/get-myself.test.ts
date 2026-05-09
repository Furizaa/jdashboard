import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { Unauthorized } from '../../../gateways/jira/errors'
import { JiraGateway } from '../../../gateways/jira/port'
import { fakeJiraGateway } from './__fixtures__/fake-jira-gateway'
import { getMyself } from './get-myself'

function provide<A, E>(
  program: Effect.Effect<A, E, JiraGateway>,
  jira: ReturnType<typeof fakeJiraGateway>,
): Effect.Effect<A, E, never> {
  return program.pipe(Effect.provide(Layer.succeed(JiraGateway, jira)))
}

describe('getMyself', () => {
  it.effect('returns the user from the gateway on success', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        getMyself: () =>
          Effect.succeed({
            accountId: 'acc-1',
            displayName: 'Andreas',
            avatarUrl: 'https://j/avatar',
          }),
      })
      const result = yield* provide(getMyself, jira)
      expect(result.user).toEqual({
        accountId: 'acc-1',
        displayName: 'Andreas',
        avatarUrl: 'https://j/avatar',
      })
    }),
  )

  it.effect('propagates Unauthorized as a tagged failure', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        getMyself: () => Effect.fail(new Unauthorized()),
      })
      const failure = yield* provide(getMyself, jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Unauthorized')
    }),
  )
})

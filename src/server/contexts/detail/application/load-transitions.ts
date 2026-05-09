import { Effect } from 'effect'
import { JiraGateway } from '../../../gateways/jira/port'
import type { AllowedTransition } from '../../../gateways/jira/types'
import type { LoadTransitionsError } from '../errors'

export type LoadTransitionsOk = {
  readonly transitions: readonly AllowedTransition[]
}

export const loadTransitions = (
  key: string,
): Effect.Effect<LoadTransitionsOk, LoadTransitionsError, JiraGateway> =>
  Effect.gen(function* () {
    const jira = yield* JiraGateway
    const transitions = yield* jira.getTransitions(key).pipe(
      Effect.catchTags({
        Rejected: (e) => Effect.die(e),
      }),
    )
    return { transitions }
  })

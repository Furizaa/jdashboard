import { Effect } from 'effect'
import { JiraGateway } from '../../../gateways/jira/port'
import type { JiraUser } from '../../../gateways/jira/types'
import type { LoadMyselfError } from '../errors'

export type LoadMyselfOk = {
  readonly user: JiraUser
}

export const loadMyself: Effect.Effect<LoadMyselfOk, LoadMyselfError, JiraGateway> = Effect.gen(
  function* () {
    const jira = yield* JiraGateway
    const user = yield* jira.getMyself().pipe(
      Effect.catchTags({
        NotFound: (e) => Effect.die(e),
        Rejected: (e) => Effect.die(e),
      }),
    )
    return { user }
  },
)

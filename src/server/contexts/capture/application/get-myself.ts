import { Effect } from 'effect'
import { JiraGateway } from '../../../gateways/jira/port'
import type { GatewayUser } from '../../../gateways/jira/types'
import type { GetMyselfError } from '../errors'

export type GetMyselfOk = {
  readonly user: GatewayUser
}

export const getMyself: Effect.Effect<GetMyselfOk, GetMyselfError, JiraGateway> = Effect.gen(
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

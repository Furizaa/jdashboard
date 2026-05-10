import { Effect } from 'effect'
import { JiraGateway } from '../../../gateways/jira/port'
import type { JiraUser } from '../../../gateways/jira/types'
import { dieOn } from '../../../lib/die-on'
import type { LoadMyselfError } from '../errors'

export type LoadMyselfOk = {
  readonly user: JiraUser
}

export const loadMyself: Effect.Effect<LoadMyselfOk, LoadMyselfError, JiraGateway> = Effect.gen(
  function* () {
    const jira = yield* JiraGateway
    const user = yield* jira.getMyself().pipe(dieOn('NotFound', 'Rejected', 'TransportError'))
    return { user }
  },
)

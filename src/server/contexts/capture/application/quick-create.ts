import { Effect } from 'effect'
import { JiraGateway } from '../../../gateways/jira/port'
import { dieOn } from '../../../lib/die-on'
import { buildCreatePayload } from '../domain/build-create-payload'
import { CaptureConfig } from '../config'
import type { QuickCreateError } from '../errors'
import type { QuickCreateInput } from './quick-create-schema'

export type QuickCreateOk = {
  readonly key: string
  readonly baseUrl: string
}

export const quickCreate = (
  input: QuickCreateInput,
): Effect.Effect<QuickCreateOk, QuickCreateError, JiraGateway | CaptureConfig> =>
  Effect.gen(function* () {
    const jira = yield* JiraGateway
    const config = yield* CaptureConfig
    const me = yield* jira.getMyself().pipe(dieOn('NotFound'))
    const body = buildCreatePayload({
      form: input,
      currentUser: { accountId: me.accountId },
      projectKey: config.projectKey,
      config: config.quickCreate,
    })
    const created = yield* jira.createIssue(body).pipe(dieOn('NotFound'))
    return { key: created.key, baseUrl: config.baseUrl }
  })

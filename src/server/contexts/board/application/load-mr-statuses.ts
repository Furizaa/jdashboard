import { Clock, Effect } from 'effect'
import { fetchMrBundle, type MrBundle } from '../../../gateways/gitlab/mr-fanout'
import { GitlabGateway } from '../../../gateways/gitlab/port'
import { buildMrKeyMap } from '../../../gateways/gitlab/mr-key-map'
import { summarizeMr } from '../../../gateways/gitlab/mr-status'
import type { MrSummary, RawMrSummary } from '../../../gateways/gitlab/types'
import { dieOn } from '../../../lib/die-on'
import { BoardConfig } from '../config'
import type { LoadMrStatusesError } from '../errors'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_STATES: ReadonlyArray<'opened' | 'merged'> = ['opened', 'merged']

export type LoadMrStatusesOk = {
  readonly byKey: Readonly<Record<string, MrSummary>>
}

type FanOut = MrBundle & { key: string }

export const loadMrStatuses: Effect.Effect<
  LoadMrStatusesOk,
  LoadMrStatusesError,
  GitlabGateway | BoardConfig
> = Effect.gen(function* () {
  const gitlab = yield* GitlabGateway
  const config = yield* BoardConfig

  const me = yield* gitlab.getCurrentUser().pipe(dieOn('NotFound', 'Rejected'))

  const nowMs = yield* Clock.currentTimeMillis
  const updatedAfter = new Date(nowMs - config.doneWindowDays * MS_PER_DAY)

  const list = yield* gitlab
    .listMrs({
      states: DEFAULT_STATES,
      authorUsername: me.username,
      updatedAfter,
    })
    .pipe(dieOn('NotFound', 'Rejected'))

  const matched = buildMrKeyMap(list, config.projectKey)

  const fetchOne = (
    entry: [string, RawMrSummary],
  ): Effect.Effect<FanOut | null, LoadMrStatusesError> => {
    const [key, mr] = entry
    return fetchMrBundle(gitlab, mr.iid).pipe(
      Effect.map((bundle) => (bundle === null ? null : { key, ...bundle })),
    )
  }

  const fanOuts = yield* Effect.all(Object.entries(matched).map(fetchOne), { concurrency: 5 })

  const byKey: Record<string, MrSummary> = {}
  for (const fo of fanOuts) {
    if (fo === null) continue
    const approvedUsernames = new Set(fo.approvals.approvedUsernames)
    const requestedChangesUsernames = new Set(
      fo.reviewers.filter((r) => r.state === 'requested_changes').map((r) => r.username),
    )
    byKey[fo.key] = summarizeMr(
      fo.detail,
      fo.discussions,
      approvedUsernames,
      requestedChangesUsernames,
    )
  }
  return { byKey }
})

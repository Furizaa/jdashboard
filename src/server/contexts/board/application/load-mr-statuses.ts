import { Clock, Effect } from 'effect'
import { GitlabGateway } from '../../../gateways/gitlab/port'
import { buildMrKeyMap } from '../../../gateways/gitlab/mr-key-map'
import { summarizeMr } from '../../../gateways/gitlab/mr-status'
import type {
  MrSummary,
  RawApprovals,
  RawDiscussion,
  RawMrDetail,
  RawMrReviewerWithState,
  RawMrSummary,
} from '../../../gateways/gitlab/types'
import { BoardConfig } from '../config'
import type { LoadMrStatusesError } from '../errors'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_STATES: ReadonlyArray<'opened' | 'merged'> = ['opened', 'merged']

export type LoadMrStatusesOk = {
  readonly byKey: Readonly<Record<string, MrSummary>>
}

type FanOut = {
  key: string
  iid: number
  detail: RawMrDetail
  discussions: readonly RawDiscussion[]
  approvals: RawApprovals
  reviewers: readonly RawMrReviewerWithState[]
}

export const loadMrStatuses: Effect.Effect<
  LoadMrStatusesOk,
  LoadMrStatusesError,
  GitlabGateway | BoardConfig
> = Effect.gen(function* () {
  const gitlab = yield* GitlabGateway
  const config = yield* BoardConfig

  const me = yield* gitlab.getCurrentUser().pipe(
    Effect.catchTags({
      NotFound: (e) => Effect.die(e),
      Rejected: (e) => Effect.die(e),
    }),
  )

  const nowMs = yield* Clock.currentTimeMillis
  const updatedAfter = new Date(nowMs - config.doneWindowDays * MS_PER_DAY)

  const list = yield* gitlab
    .listMrs({
      states: DEFAULT_STATES,
      authorUsername: me.username,
      updatedAfter,
    })
    .pipe(
      Effect.catchTags({
        NotFound: (e) => Effect.die(e),
        Rejected: (e) => Effect.die(e),
      }),
    )

  const matched = buildMrKeyMap(list, config.projectKey)

  const fetchOne = (
    entry: [string, RawMrSummary],
  ): Effect.Effect<FanOut | null, LoadMrStatusesError> => {
    const [key, mr] = entry
    return Effect.all(
      [
        gitlab.getMr(mr.iid),
        gitlab.getMrDiscussions(mr.iid),
        gitlab.getMrApprovals(mr.iid),
        gitlab.getMrReviewers(mr.iid),
      ],
      { concurrency: 'unbounded' },
    ).pipe(
      Effect.map(
        ([detail, discussions, approvals, reviewers]): FanOut => ({
          key,
          iid: mr.iid,
          detail,
          discussions,
          approvals,
          reviewers,
        }),
      ),
      Effect.catchTags({
        NotFound: () => Effect.succeed(null),
        Rejected: () => Effect.succeed(null),
      }),
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

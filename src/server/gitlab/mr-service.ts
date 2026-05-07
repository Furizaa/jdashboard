import type {
  GitlabGateway,
  GitlabResult,
  RawApprovals,
  RawDiscussion,
  RawMrDetail,
  RawMrSummary,
} from './gateway'
import { buildMrKeyMap } from './mr-key-map'
import { summarizeMr, type MrSummary } from './mr-status'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type GetCurrentUserResult =
  | { ok: true; username: string; displayName: string }
  | { ok: false; reason: 'unauthorized' }

export type GetMrStatusesResult =
  | { ok: true; byKey: Record<string, MrSummary> }
  | { ok: false; reason: 'unauthorized' }

export type GitlabMrServiceConfig = {
  jiraProjectKey: string
  lookbackDays: number
  defaultStates: ReadonlyArray<'opened' | 'merged'>
  clock: () => Date
}

export type GitlabMrService = {
  getCurrentUser(): Promise<GetCurrentUserResult>
  getMrStatuses(): Promise<GetMrStatusesResult>
}

function unexpectedReason(label: string, reason: string, message?: string): Error {
  const detail = reason === 'rejected' && message ? `${reason}: ${message}` : reason
  return new Error(`${label}: unexpected ${detail}`)
}

type FanOut = {
  key: string
  iid: number
  detail: GitlabResult<RawMrDetail>
  discussions: GitlabResult<RawDiscussion[]>
  approvals: GitlabResult<RawApprovals>
}

function isUnauthorized(result: GitlabResult<unknown>): boolean {
  return !result.ok && result.reason === 'unauthorized'
}

export function createGitlabMrService(
  gateway: GitlabGateway,
  config: GitlabMrServiceConfig,
): GitlabMrService {
  return {
    async getCurrentUser() {
      const result = await gateway.getCurrentUser()
      if (result.ok) {
        return {
          ok: true,
          username: result.value.username,
          displayName: result.value.displayName,
        }
      }
      if (result.reason === 'unauthorized') {
        return { ok: false, reason: 'unauthorized' }
      }
      throw unexpectedReason(
        'getCurrentUser',
        result.reason,
        result.reason === 'rejected' ? result.message : undefined,
      )
    },

    async getMrStatuses() {
      const userResult = await gateway.getCurrentUser()
      if (!userResult.ok) {
        if (userResult.reason === 'unauthorized') {
          return { ok: false, reason: 'unauthorized' }
        }
        throw unexpectedReason(
          'getMrStatuses (getCurrentUser)',
          userResult.reason,
          userResult.reason === 'rejected' ? userResult.message : undefined,
        )
      }
      const currentUsername = userResult.value.username

      const updatedAfter = new Date(config.clock().getTime() - config.lookbackDays * MS_PER_DAY)
      const listResult = await gateway.listMrs({
        states: config.defaultStates,
        authorUsername: currentUsername,
        updatedAfter,
      })
      if (!listResult.ok) {
        if (listResult.reason === 'unauthorized') {
          return { ok: false, reason: 'unauthorized' }
        }
        throw unexpectedReason(
          'getMrStatuses (listMrs)',
          listResult.reason,
          listResult.reason === 'rejected' ? listResult.message : undefined,
        )
      }

      const matched = buildMrKeyMap(listResult.value, config.jiraProjectKey)
      const fanOuts: FanOut[] = await Promise.all(
        Object.entries(matched).map(async ([key, mr]: [string, RawMrSummary]) => {
          const [detail, discussions, approvals] = await Promise.all([
            gateway.getMr(mr.iid),
            gateway.getMrDiscussions(mr.iid),
            gateway.getMrApprovals(mr.iid),
          ])
          return { key, iid: mr.iid, detail, discussions, approvals }
        }),
      )

      for (const fo of fanOuts) {
        if (
          isUnauthorized(fo.detail) ||
          isUnauthorized(fo.discussions) ||
          isUnauthorized(fo.approvals)
        ) {
          return { ok: false, reason: 'unauthorized' }
        }
      }

      const byKey: Record<string, MrSummary> = {}
      for (const fo of fanOuts) {
        if (!fo.detail.ok) {
          throw unexpectedReason(
            `getMrStatuses (getMr ${fo.iid})`,
            fo.detail.reason,
            fo.detail.reason === 'rejected' ? fo.detail.message : undefined,
          )
        }
        if (!fo.discussions.ok) {
          throw unexpectedReason(
            `getMrStatuses (getMrDiscussions ${fo.iid})`,
            fo.discussions.reason,
            fo.discussions.reason === 'rejected' ? fo.discussions.message : undefined,
          )
        }
        if (!fo.approvals.ok) {
          throw unexpectedReason(
            `getMrStatuses (getMrApprovals ${fo.iid})`,
            fo.approvals.reason,
            fo.approvals.reason === 'rejected' ? fo.approvals.message : undefined,
          )
        }
        const approvedUsernames = new Set(fo.approvals.value.approvedUsernames)
        byKey[fo.key] = summarizeMr(
          fo.detail.value,
          fo.discussions.value,
          approvedUsernames,
          currentUsername,
        )
      }
      return { ok: true, byKey }
    },
  }
}

import type {
  GitlabGateway,
  GitlabResult,
  RawDiscussion,
  RawMrReviewerWithState,
  ReviewerEndpointState,
} from './gateway'
import { extractKeysFromTitle } from './mr-key-map'
import { ciVisualState, type CiVisualState } from '~/features/mr-status/ci-state'
import { countUnresolvedThreads } from '~/features/mr-status/count-unresolved'
import {
  reviewerVisualState,
  type ReviewerApprovalStatus,
  type ReviewerVisualState,
} from '~/features/mr-status/reviewer-state'
import { reviewBucket, type MrState } from '~/features/mr-status/review-state'
import type { JiraIssueService } from '~/server/jira/issue-service'

const MS_PER_DAY = 24 * 60 * 60 * 1000

type ReviewerVisual = {
  username: string
  displayName: string
  avatarUrl: string | null
  visualState: ReviewerVisualState
}

type ReviewCardCommon = {
  iid: number
  webUrl: string
  title: string
  bucket: 'needs-review' | 'rejected' | 'accepted'
  mrState: 'opened' | 'merged'
  reviewers: ReviewerVisual[]
  unresolvedCount: number
  ciState: CiVisualState
}

export type ReviewCardJira = {
  key: string
  summary: string
  typeName: string
  labels: string[]
  epic: { key: string; summary: string } | null
}

export type ReviewCardReal = ReviewCardCommon & {
  kind: 'review-real'
  jira: ReviewCardJira
}

export type ReviewCardFake = ReviewCardCommon & {
  kind: 'review-fake'
  jira: null
}

export type ReviewCard = ReviewCardReal | ReviewCardFake

export type GetReviewCardsResult =
  | { ok: true; baseUrl: string; cards: ReviewCard[] }
  | { ok: false; reason: 'unauthorized' }

export type GitlabReviewServiceConfig = {
  jiraProjectKey: string
  lookbackDays: number
  clock: () => Date
}

export type GitlabReviewService = {
  getReviewCards(): Promise<GetReviewCardsResult>
}

function unexpectedReason(label: string, reason: string, message?: string): Error {
  const detail = reason === 'rejected' && message ? `${reason}: ${message}` : reason
  return new Error(`${label}: unexpected ${detail}`)
}

function isUnauthorized(result: GitlabResult<unknown>): boolean {
  return !result.ok && result.reason === 'unauthorized'
}

function endpointStateToApprovalStatus(state: ReviewerEndpointState): ReviewerApprovalStatus {
  if (state === 'approved') return 'approved'
  if (state === 'requested_changes') return 'requested_changes'
  if (state === 'reviewed' || state === 'review_started') return 'reviewed'
  return 'unreviewed'
}

function hasNotesFromUser(discussions: readonly RawDiscussion[], username: string): boolean {
  for (const d of discussions) {
    for (const n of d.notes) {
      if (n.authorUsername === username) return true
    }
  }
  return false
}

function buildReviewers(
  reviewers: readonly RawMrReviewerWithState[],
  discussions: readonly RawDiscussion[],
  unresolvedCount: number,
): ReviewerVisual[] {
  return reviewers.map((r) => {
    const hasNotes = hasNotesFromUser(discussions, r.username)
    const approvalStatus = endpointStateToApprovalStatus(r.state)
    const visualState = reviewerVisualState(approvalStatus, hasNotes, unresolvedCount)
    return {
      username: r.username,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      visualState,
    }
  })
}

function isOpenedOrMerged(state: string): state is 'opened' | 'merged' {
  return state === 'opened' || state === 'merged'
}

export function createGitlabReviewService(
  gitlabGateway: GitlabGateway,
  jiraService: JiraIssueService,
  config: GitlabReviewServiceConfig,
): GitlabReviewService {
  return {
    async getReviewCards() {
      const userResult = await gitlabGateway.getCurrentUser()
      if (!userResult.ok) {
        if (userResult.reason === 'unauthorized') {
          return { ok: false, reason: 'unauthorized' }
        }
        throw unexpectedReason(
          'getReviewCards (getCurrentUser)',
          userResult.reason,
          userResult.reason === 'rejected' ? userResult.message : undefined,
        )
      }
      const currentUsername = userResult.value.username

      const updatedAfter = new Date(config.clock().getTime() - config.lookbackDays * MS_PER_DAY)
      const listResult = await gitlabGateway.listMrs({
        states: ['opened', 'merged'],
        reviewerUsername: currentUsername,
        updatedAfter,
      })
      if (!listResult.ok) {
        if (listResult.reason === 'unauthorized') {
          return { ok: false, reason: 'unauthorized' }
        }
        throw unexpectedReason(
          'getReviewCards (listMrs)',
          listResult.reason,
          listResult.reason === 'rejected' ? listResult.message : undefined,
        )
      }

      const candidates = listResult.value.filter((mr) => !mr.draft)

      const fanOuts = await Promise.all(
        candidates.map(async (mr) => {
          const [detail, discussions, approvals, reviewers] = await Promise.all([
            gitlabGateway.getMr(mr.iid),
            gitlabGateway.getMrDiscussions(mr.iid),
            gitlabGateway.getMrApprovals(mr.iid),
            gitlabGateway.getMrReviewers(mr.iid),
          ])
          return { mr, detail, discussions, approvals, reviewers }
        }),
      )

      for (const fo of fanOuts) {
        if (
          isUnauthorized(fo.detail) ||
          isUnauthorized(fo.discussions) ||
          isUnauthorized(fo.approvals) ||
          isUnauthorized(fo.reviewers)
        ) {
          return { ok: false, reason: 'unauthorized' }
        }
      }

      type Pre = {
        iid: number
        webUrl: string
        title: string
        bucket: 'needs-review' | 'rejected' | 'accepted'
        mrState: 'opened' | 'merged'
        reviewers: ReviewerVisual[]
        unresolvedCount: number
        ciState: CiVisualState
        firstKey: string | null
      }

      const pre: Pre[] = []
      for (const fo of fanOuts) {
        if (!fo.detail.ok) {
          throw unexpectedReason(
            `getReviewCards (getMr ${fo.mr.iid})`,
            fo.detail.reason,
            fo.detail.reason === 'rejected' ? fo.detail.message : undefined,
          )
        }
        if (!fo.discussions.ok) {
          throw unexpectedReason(
            `getReviewCards (getMrDiscussions ${fo.mr.iid})`,
            fo.discussions.reason,
            fo.discussions.reason === 'rejected' ? fo.discussions.message : undefined,
          )
        }
        if (!fo.approvals.ok) {
          throw unexpectedReason(
            `getReviewCards (getMrApprovals ${fo.mr.iid})`,
            fo.approvals.reason,
            fo.approvals.reason === 'rejected' ? fo.approvals.message : undefined,
          )
        }
        if (!fo.reviewers.ok) {
          throw unexpectedReason(
            `getReviewCards (getMrReviewers ${fo.mr.iid})`,
            fo.reviewers.reason,
            fo.reviewers.reason === 'rejected' ? fo.reviewers.message : undefined,
          )
        }

        const myEntry = fo.reviewers.value.find((r) => r.username === currentUsername)
        if (myEntry === undefined) continue

        const detailState = fo.detail.value.state as MrState | 'locked'
        if (detailState === 'locked') continue

        const bucket = reviewBucket(myEntry.state, detailState)
        if (bucket === 'drop') continue
        if (!isOpenedOrMerged(detailState)) continue

        const unresolvedCount = countUnresolvedThreads(fo.discussions.value, currentUsername)
        const reviewersVisual = buildReviewers(
          fo.reviewers.value,
          fo.discussions.value,
          unresolvedCount,
        )
        const ci = ciVisualState({
          headPipelineStatus: fo.detail.value.headPipelineStatus,
          hasConflicts: fo.detail.value.hasConflicts,
        })
        const firstKey = extractKeysFromTitle(fo.mr.title, config.jiraProjectKey)[0] ?? null

        pre.push({
          iid: fo.mr.iid,
          webUrl: fo.mr.webUrl,
          title: fo.mr.title,
          bucket,
          mrState: detailState,
          reviewers: reviewersVisual,
          unresolvedCount,
          ciState: ci,
          firstKey,
        })
      }

      const uniqueKeys = [
        ...new Set(pre.map((p) => p.firstKey).filter((k): k is string => k !== null)),
      ]
      const bulk = await jiraService.bulkLoadIssues(uniqueKeys)
      if (!bulk.ok) {
        if (bulk.reason === 'unauthorized') {
          return { ok: false, reason: 'unauthorized' }
        }
        throw unexpectedReason('getReviewCards (bulkLoadIssues)', bulk.reason)
      }
      const foundByKey = new Map(bulk.found.map((i) => [i.key, i]))

      const cards: ReviewCard[] = []
      for (const p of pre) {
        const common: ReviewCardCommon = {
          iid: p.iid,
          webUrl: p.webUrl,
          title: p.title,
          bucket: p.bucket,
          mrState: p.mrState,
          reviewers: p.reviewers,
          unresolvedCount: p.unresolvedCount,
          ciState: p.ciState,
        }
        const found = p.firstKey !== null ? foundByKey.get(p.firstKey) : undefined
        if (found !== undefined) {
          cards.push({
            kind: 'review-real',
            ...common,
            jira: {
              key: found.key,
              summary: found.summary,
              typeName: found.typeName,
              labels: found.labels,
              epic: found.epic,
            },
          })
        } else {
          cards.push({ kind: 'review-fake', ...common, jira: null })
        }
      }

      return { ok: true, baseUrl: bulk.baseUrl, cards }
    },
  }
}

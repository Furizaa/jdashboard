import { Clock, Effect } from 'effect'
import { JiraGateway } from '../../../gateways/jira/port'
import type { BoardIssue, RawIssue } from '../../../gateways/jira/types'
import { fetchMrBundle, type MrBundle } from '../../../gateways/gitlab/mr-fanout'
import { GitlabGateway } from '../../../gateways/gitlab/port'
import type {
  RawDiscussion,
  RawMrReviewerWithState,
  RawMrSummary,
  ReviewCard,
  ReviewerEndpointState,
} from '../../../gateways/gitlab/types'
import {
  ciVisualState,
  countUnresolvedThreads,
  reviewBucket,
  reviewerVisualState,
  type CiVisualState,
  type MrState,
  type ReviewerApprovalStatus,
  type ReviewerVisualState,
} from '../../../gateways/gitlab/mr'
import { extractKeysFromTitle } from '../../../gateways/gitlab/mr-key-map'
import { ReviewConfig } from '../config'
import type { LoadReviewCardsError } from '../errors'
import { quoteJqlString } from '../../../lib/jql'

const MS_PER_DAY = 24 * 60 * 60 * 1000

const BULK_FIELDS = ['summary', 'status', 'labels', 'issuetype', 'parent'] as const

export type LoadReviewCardsOk = {
  readonly baseUrl: string
  readonly cards: readonly ReviewCard[]
}

type ReviewerVisual = {
  username: string
  displayName: string
  avatarUrl: string | null
  visualState: ReviewerVisualState
}

type MrFanOut = MrBundle & { mr: RawMrSummary }

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

function endpointStateToApprovalStatus(state: ReviewerEndpointState): ReviewerApprovalStatus {
  if (state === 'approved') return 'approved'
  if (state === 'requested_changes') return 'requested_changes'
  if (state === 'reviewed' || state === 'review_started') return 'reviewed'
  return 'unreviewed'
}

function hasNotesFromUser(discussions: readonly RawDiscussion[], username: string): boolean {
  for (const d of discussions) {
    for (const n of d.notes) {
      if (n.system) continue
      if (n.authorUsername === username) return true
    }
  }
  return false
}

function buildReviewerVisuals(
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

function buildBulkIssuesJql(keys: readonly string[]): string {
  return `key in (${keys.map(quoteJqlString).join(', ')})`
}

function toBoardIssue(issue: RawIssue, hideSet: ReadonlySet<string>): BoardIssue {
  const parent = issue.fields.parent
  const parentIsEpic = parent?.fields?.issuetype?.name?.toLowerCase() === 'epic'
  return {
    key: issue.key,
    summary: issue.fields.summary,
    statusName: issue.fields.status.name,
    typeName: issue.fields.issuetype?.name ?? 'Task',
    labels: (issue.fields.labels ?? []).filter((label) => !hideSet.has(label.toLowerCase())),
    epic:
      parentIsEpic && parent
        ? { key: parent.key, summary: parent.fields?.summary ?? parent.key }
        : null,
  }
}

const fanOutForMr =
  (gitlab: GitlabGateway['Type']) =>
  (mr: RawMrSummary): Effect.Effect<MrFanOut | null, LoadReviewCardsError> =>
    fetchMrBundle(gitlab, mr.iid).pipe(
      Effect.map((bundle) => (bundle === null ? null : { mr, ...bundle })),
    )

function preFromFanOut(fo: MrFanOut, currentUsername: string, projectKey: string): Pre | null {
  const myEntry = fo.reviewers.find((r) => r.username === currentUsername)
  if (myEntry === undefined) return null

  const detailState = fo.detail.state as MrState | 'locked'
  if (detailState === 'locked') return null

  const bucket = reviewBucket(myEntry.state, detailState)
  if (bucket === 'drop') return null
  if (!isOpenedOrMerged(detailState)) return null

  const unresolvedCount = countUnresolvedThreads(fo.discussions)
  const reviewersVisual = buildReviewerVisuals(fo.reviewers, fo.discussions, unresolvedCount)
  const ci = ciVisualState({
    headPipelineStatus: fo.detail.headPipelineStatus,
    hasConflicts: fo.detail.hasConflicts,
  })
  const firstKey = extractKeysFromTitle(fo.mr.title, projectKey)[0] ?? null

  return {
    iid: fo.mr.iid,
    webUrl: fo.mr.webUrl,
    title: fo.mr.title,
    bucket,
    mrState: detailState,
    reviewers: reviewersVisual,
    unresolvedCount,
    ciState: ci,
    firstKey,
  }
}

const lookupBulkIssues = (
  jira: JiraGateway['Type'],
  uniqueKeys: readonly string[],
  hideLabels: readonly string[],
): Effect.Effect<BoardIssue[], LoadReviewCardsError> => {
  if (uniqueKeys.length === 0) return Effect.succeed([])
  const hideSet = new Set(hideLabels.map((l) => l.toLowerCase()))
  return jira.searchIssues(buildBulkIssuesJql(uniqueKeys), BULK_FIELDS).pipe(
    Effect.catchTags({
      NotFound: (e) => Effect.die(e),
      Rejected: (e) => Effect.die(e),
    }),
    Effect.map((response) => response.issues.map((issue) => toBoardIssue(issue, hideSet))),
  )
}

function buildCard(p: Pre, foundByKey: ReadonlyMap<string, BoardIssue>): ReviewCard {
  const common = {
    iid: p.iid,
    webUrl: p.webUrl,
    title: p.title,
    bucket: p.bucket,
    mrState: p.mrState,
    reviewers: p.reviewers,
    unresolvedCount: p.unresolvedCount,
    ciState: p.ciState,
  } as const
  const found = p.firstKey !== null ? foundByKey.get(p.firstKey) : undefined
  if (found !== undefined) {
    return {
      kind: 'review-real',
      ...common,
      jira: {
        key: found.key,
        summary: found.summary,
        typeName: found.typeName,
        labels: found.labels,
        epic: found.epic,
      },
    }
  }
  return { kind: 'review-fake', ...common, jiraKeyAttempted: p.firstKey }
}

export const loadReviewCards: Effect.Effect<
  LoadReviewCardsOk,
  LoadReviewCardsError,
  GitlabGateway | JiraGateway | ReviewConfig
> = Effect.gen(function* () {
  const gitlab = yield* GitlabGateway
  const jira = yield* JiraGateway
  const config = yield* ReviewConfig

  const me = yield* gitlab.getCurrentUser().pipe(
    Effect.catchTags({
      NotFound: (e) => Effect.die(e),
      Rejected: (e) => Effect.die(e),
    }),
  )

  const nowMs = yield* Clock.currentTimeMillis
  const updatedAfter = new Date(nowMs - config.lookbackDays * MS_PER_DAY)

  const list = yield* gitlab
    .listMrs({ states: ['opened', 'merged'], reviewerUsername: me.username, updatedAfter })
    .pipe(
      Effect.catchTags({
        NotFound: (e) => Effect.die(e),
        Rejected: (e) => Effect.die(e),
      }),
    )

  const candidates = list.filter((mr) => !mr.draft)

  const fanOuts = yield* Effect.all(candidates.map(fanOutForMr(gitlab)), { concurrency: 5 })

  const pre: Pre[] = []
  for (const fo of fanOuts) {
    if (fo === null) continue
    const p = preFromFanOut(fo, me.username, config.jiraProjectKey)
    if (p !== null) pre.push(p)
  }

  const uniqueKeys = [...new Set(pre.map((p) => p.firstKey).filter((k): k is string => k !== null))]
  const found = yield* lookupBulkIssues(jira, uniqueKeys, config.hideLabels)
  const foundByKey = new Map(found.map((i) => [i.key, i]))
  const cards = pre.map((p) => buildCard(p, foundByKey))

  return { baseUrl: config.baseUrl, cards }
})

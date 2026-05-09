import type { CiVisualState, ReviewerVisualState } from './mr'

export type GitlabUser = {
  username: string
  displayName: string
}

export type RawMrSummary = {
  iid: number
  title: string
  webUrl: string
  state: 'opened' | 'closed' | 'merged' | 'locked'
  draft: boolean
  updatedAt: string
}

export type RawReviewer = {
  username: string
  displayName: string
  avatarUrl: string | null
}

export type RawMrDetail = RawMrSummary & {
  reviewers: RawReviewer[]
  headPipelineStatus: string | null
  hasConflicts: boolean
}

export type RawNote = {
  authorUsername: string
  resolvable: boolean
  resolved: boolean
  system: boolean
}

export type RawDiscussion = {
  id: string
  notes: RawNote[]
}

export type RawApprovals = {
  approvedUsernames: readonly string[]
}

export type ReviewerEndpointState =
  | 'unreviewed'
  | 'review_started'
  | 'reviewed'
  | 'requested_changes'
  | 'approved'

export type RawMrReviewerWithState = {
  username: string
  displayName: string
  avatarUrl: string | null
  state: ReviewerEndpointState
}

export type ListMrsQuery = {
  states: ReadonlyArray<'opened' | 'merged'>
  updatedAfter: Date
} & ({ authorUsername: string } | { reviewerUsername: string })

export type MrReviewerState = {
  username: string
  displayName: string
  avatarUrl: string | null
  visualState: ReviewerVisualState
}

type CommonMrFields = {
  iid: number
  title: string
  webUrl: string
}

export type MrSummary =
  | ({ kind: 'merged' } & CommonMrFields)
  | ({ kind: 'draft' } & CommonMrFields)
  | ({ kind: 'no-reviewers' } & CommonMrFields)
  | ({
      kind: 'review'
      reviewers: MrReviewerState[]
      unresolvedCount: number
      allApprovedAndClean: boolean
      ciState: CiVisualState
    } & CommonMrFields)

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
  jiraKeyAttempted: string | null
}

export type ReviewCard = ReviewCardReal | ReviewCardFake

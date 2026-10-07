import type { CiVisualState, MrPriority, ReviewerVisualState } from './mr'

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
  sourceBranch: string
  // The branch this MR merges *into*. Needed to express "the change" as a diff
  // range, which not every MR takes against `develop` (ADR-0009 §5).
  targetBranch: string
  // The source branch's head commit. The commit an Explain report describes, and
  // what makes it reproducible rather than "whatever the branch said at the time".
  headSha: string
  // The author's own account of what the change does — review context no diff carries.
  description: string
  reviewers: RawReviewer[]
  headPipelineStatus: string | null
  hasConflicts: boolean
  labels: readonly string[]
}

export type RawNote = {
  authorUsername: string
  // The comment text. Empty for most system notes, which callers filter out anyway.
  body: string
  resolvable: boolean
  resolved: boolean
  system: boolean
}

export type RawDiscussion = {
  id: string
  notes: RawNote[]
}

// One file's diff in a merge request, as `/merge_requests/:iid/diffs` returns
// it. Read on demand by a move page's whole-diff expander (ADR-0010 §6) — the
// first thing Explain reads from GitLab that the agent did not already put in
// the report.
export type RawMrDiff = {
  oldPath: string
  newPath: string
  newFile: boolean
  renamedFile: boolean
  deletedFile: boolean
  // Unified diff text. Empty for a binary file, and for one GitLab collapsed
  // because it is too large to render.
  diff: string
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
  priority: MrPriority | null
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
  priority: MrPriority | null
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

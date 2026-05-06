import type {
  GitlabDiscussion,
  GitlabMrDetail,
  GitlabMrSummary,
} from './client'
import { countUnresolvedThreads } from '~/features/mr-status/count-unresolved'
import {
  reviewerVisualState,
  type ReviewerApprovalStatus,
  type ReviewerVisualState,
} from '~/features/mr-status/reviewer-state'

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
    } & CommonMrFields)

function commonFields(mr: GitlabMrSummary): CommonMrFields {
  return { iid: mr.iid, title: mr.title, webUrl: mr.web_url }
}

function hasNotesFromUser(
  discussions: readonly GitlabDiscussion[],
  username: string,
): boolean {
  for (const discussion of discussions) {
    for (const note of discussion.notes) {
      if (note.author.username === username) return true
    }
  }
  return false
}

function deriveApprovalStatus(
  username: string,
  approvedUsernames: ReadonlySet<string>,
  hasNotes: boolean,
): ReviewerApprovalStatus {
  if (approvedUsernames.has(username)) return 'approved'
  if (hasNotes) return 'reviewed'
  return 'unreviewed'
}

export function summarizeMr(
  detail: GitlabMrDetail,
  discussions: readonly GitlabDiscussion[],
  approvedUsernames: ReadonlySet<string>,
  currentUsername: string,
): MrSummary {
  const common = commonFields(detail)

  if (detail.state === 'merged') {
    return { kind: 'merged', ...common }
  }
  if (detail.draft) {
    return { kind: 'draft', ...common }
  }
  if (detail.reviewers.length === 0) {
    return { kind: 'no-reviewers', ...common }
  }

  const unresolvedCount = countUnresolvedThreads(discussions, currentUsername)

  const reviewers: MrReviewerState[] = detail.reviewers.map((reviewer) => {
    const hasNotes = hasNotesFromUser(discussions, reviewer.username)
    const approvalStatus = deriveApprovalStatus(reviewer.username, approvedUsernames, hasNotes)
    const visualState = reviewerVisualState(approvalStatus, hasNotes, unresolvedCount)
    return {
      username: reviewer.username,
      displayName: reviewer.name,
      avatarUrl: reviewer.avatar_url ?? null,
      visualState,
    }
  })

  const allApprovedAndClean =
    unresolvedCount === 0 && reviewers.every((r) => r.visualState === 'green-solid')

  return {
    kind: 'review',
    ...common,
    reviewers,
    unresolvedCount,
    allApprovedAndClean,
  }
}

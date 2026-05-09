export type ReviewerVisualState =
  | 'gray-dashed'
  | 'blue-dashed'
  | 'red-solid'
  | 'green-solid'
  | 'green-dashed'

export type ReviewerApprovalStatus = 'unreviewed' | 'reviewed' | 'requested_changes' | 'approved'

export function reviewerVisualState(
  approvalStatus: ReviewerApprovalStatus,
  hasNotesFromReviewer: boolean,
  unresolvedFromOthers: number,
): ReviewerVisualState {
  if (approvalStatus === 'requested_changes') return 'red-solid'
  if (approvalStatus === 'approved') {
    return unresolvedFromOthers === 0 ? 'green-solid' : 'green-dashed'
  }
  if (approvalStatus === 'reviewed') return 'blue-dashed'
  if (hasNotesFromReviewer) return 'blue-dashed'
  return 'gray-dashed'
}

export const REVIEWER_STATE_LABEL: Record<ReviewerVisualState, string> = {
  'gray-dashed': 'Not started',
  'blue-dashed': 'Commented',
  'red-solid': 'Requested changes',
  'green-solid': 'Approved',
  'green-dashed': 'Approved with unresolved comments',
}

export const REVIEWER_BADGE_LABEL: Record<ReviewerVisualState, string> = {
  'gray-dashed': 'Pending',
  'blue-dashed': 'Reviewed',
  'red-solid': 'Requested changes',
  'green-solid': 'Approved',
  'green-dashed': 'Approved (unresolved)',
}

export type MyReviewerState =
  | 'unreviewed'
  | 'review_started'
  | 'reviewed'
  | 'requested_changes'
  | 'approved'

export type MrState = 'opened' | 'merged' | 'closed'

export type ReviewBucket = 'needs-review' | 'rejected' | 'accepted' | 'drop'

export function reviewBucket(myReviewerState: MyReviewerState, mrState: MrState): ReviewBucket {
  if (mrState === 'closed') return 'drop'
  if (mrState === 'merged') return 'accepted'
  if (myReviewerState === 'requested_changes') return 'rejected'
  if (myReviewerState === 'approved') return 'accepted'
  return 'needs-review'
}

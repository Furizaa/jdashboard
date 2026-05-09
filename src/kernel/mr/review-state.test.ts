import { describe, expect, it } from 'vitest'
import { reviewBucket, type MrState, type MyReviewerState, type ReviewBucket } from './review-state'

const REVIEWER_STATES: readonly MyReviewerState[] = [
  'unreviewed',
  'review_started',
  'reviewed',
  'requested_changes',
  'approved',
]

describe('reviewBucket', () => {
  it('drops every closed MR regardless of reviewer state', () => {
    for (const r of REVIEWER_STATES) {
      expect(reviewBucket(r, 'closed')).toBe<ReviewBucket>('drop')
    }
  })

  it('accepts every merged MR regardless of reviewer state', () => {
    for (const r of REVIEWER_STATES) {
      expect(reviewBucket(r, 'merged')).toBe<ReviewBucket>('accepted')
    }
  })

  it('opens with requested_changes → rejected', () => {
    expect(reviewBucket('requested_changes', 'opened')).toBe<ReviewBucket>('rejected')
  })

  it('opens with approved → accepted', () => {
    expect(reviewBucket('approved', 'opened')).toBe<ReviewBucket>('accepted')
  })

  it('opens with unreviewed / review_started / reviewed → needs-review', () => {
    const cases: MyReviewerState[] = ['unreviewed', 'review_started', 'reviewed']
    for (const r of cases) {
      expect(reviewBucket(r, 'opened')).toBe<ReviewBucket>('needs-review')
    }
  })

  it('exhaustively maps every (reviewer, mr-state) combination', () => {
    const mrStates: readonly MrState[] = ['opened', 'merged', 'closed']
    const expected: Record<MrState, Record<MyReviewerState, ReviewBucket>> = {
      closed: {
        unreviewed: 'drop',
        review_started: 'drop',
        reviewed: 'drop',
        requested_changes: 'drop',
        approved: 'drop',
      },
      merged: {
        unreviewed: 'accepted',
        review_started: 'accepted',
        reviewed: 'accepted',
        requested_changes: 'accepted',
        approved: 'accepted',
      },
      opened: {
        unreviewed: 'needs-review',
        review_started: 'needs-review',
        reviewed: 'needs-review',
        requested_changes: 'rejected',
        approved: 'accepted',
      },
    }
    for (const m of mrStates) {
      for (const r of REVIEWER_STATES) {
        expect(reviewBucket(r, m)).toBe(expected[m][r])
      }
    }
  })
})

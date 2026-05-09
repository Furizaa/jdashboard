import { describe, expect, it } from 'vitest'
import type { ReviewCard, ReviewCardFake, ReviewCardReal } from '~/server/gateways/gitlab'
import {
  REVIEW_BUCKET_STATUS_NAME,
  REVIEW_CARD_ID_PREFIX,
  reviewBucketColumn,
  reviewCardId,
  reviewSearchHaystack,
} from './review'

const COMMON = {
  iid: 7,
  webUrl: 'https://gl.example/g/p/-/merge_requests/7',
  title: 'Implement HDR-1',
  reviewers: [],
  unresolvedCount: 0,
  ciState: 'none' as const,
  mrState: 'opened' as const,
}

function fake(overrides: Partial<ReviewCardFake> = {}): ReviewCardFake {
  return {
    kind: 'review-fake',
    ...COMMON,
    bucket: 'needs-review',
    jiraKeyAttempted: null,
    ...overrides,
  }
}

function real(overrides: Partial<ReviewCardReal> = {}): ReviewCardReal {
  return {
    kind: 'review-real',
    ...COMMON,
    bucket: 'needs-review',
    jira: { key: 'HDR-1', summary: 'Build the thing', typeName: 'Task', labels: [], epic: null },
    ...overrides,
  }
}

describe('reviewCardId', () => {
  it('prefixes the iid with the review-card prefix', () => {
    const card: ReviewCard = fake({ iid: 42 })
    expect(reviewCardId(card)).toBe(`${REVIEW_CARD_ID_PREFIX}42`)
  })
})

describe('reviewBucketColumn', () => {
  it('places accepted bucket in the Done column', () => {
    expect(reviewBucketColumn('accepted')).toBe('Done')
  })

  it('places needs-review and rejected buckets in the TO DO column', () => {
    expect(reviewBucketColumn('needs-review')).toBe('TO DO')
    expect(reviewBucketColumn('rejected')).toBe('TO DO')
  })
})

describe('REVIEW_BUCKET_STATUS_NAME', () => {
  it('maps each bucket to its display status name', () => {
    expect(REVIEW_BUCKET_STATUS_NAME['needs-review']).toBe('Needs Review')
    expect(REVIEW_BUCKET_STATUS_NAME.rejected).toBe('Review Rejected')
    expect(REVIEW_BUCKET_STATUS_NAME.accepted).toBe('Review Accepted')
  })
})

describe('reviewSearchHaystack', () => {
  it('uses Jira key + summary for review-real cards (lowercased)', () => {
    const card = real({
      jira: { key: 'HDR-9', summary: 'Refactor service', typeName: 'Task', labels: [], epic: null },
    })
    expect(reviewSearchHaystack(card)).toBe('hdr-9 refactor service')
  })

  it('uses "MR !<iid>" + title for review-fake cards (lowercased)', () => {
    const card = fake({ iid: 12, title: 'WIP — Bump deps' })
    expect(reviewSearchHaystack(card)).toBe('mr !12 wip — bump deps')
  })
})

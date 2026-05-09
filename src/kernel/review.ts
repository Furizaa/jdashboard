import { match } from 'ts-pattern'
import type { Column } from './columns'
import type { ReviewCard, ReviewCardReal } from './gitlab'

export const REVIEW_CARD_ID_PREFIX = 'review:'

export function reviewCardId(card: ReviewCard): string {
  return `${REVIEW_CARD_ID_PREFIX}${card.iid}`
}

export function reviewBucketColumn(bucket: ReviewCard['bucket']): Column {
  return bucket === 'accepted' ? 'Done' : 'TO DO'
}

export const REVIEW_BUCKET_STATUS_NAME: Record<ReviewCardReal['bucket'], string> = {
  'needs-review': 'Needs Review',
  rejected: 'Review Rejected',
  accepted: 'Review Accepted',
}

export function reviewSearchHaystack(card: ReviewCard): string {
  return match(card)
    .with({ kind: 'review-real' }, (c) => `${c.jira.key} ${c.jira.summary}`.toLowerCase())
    .with({ kind: 'review-fake' }, (c) => `MR !${c.iid} ${c.title}`.toLowerCase())
    .exhaustive()
}

import type { GetReviewCardsResult } from '~/kernel'

export interface ReviewGateway {
  loadReviewCards(): Promise<GetReviewCardsResult>
}

export interface ReviewCachePort {
  invalidateReviewCards(): void
}

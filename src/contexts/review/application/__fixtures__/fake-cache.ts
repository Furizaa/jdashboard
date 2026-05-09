import type { ReviewCachePort } from '../ports'

export type FakeReviewCache = ReviewCachePort & {
  invalidations: () => number
}

export function createFakeReviewCache(): FakeReviewCache {
  let count = 0
  return {
    invalidateReviewCards: () => {
      count++
    },
    invalidations: () => count,
  }
}

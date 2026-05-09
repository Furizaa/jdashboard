import type { BoardCachePort } from '../ports'

export type FakeBoardCache = BoardCachePort & {
  invalidations: () => number
}

export function createFakeBoardCache(): FakeBoardCache {
  let count = 0
  return {
    invalidateBoard: () => {
      count++
    },
    invalidations: () => count,
  }
}

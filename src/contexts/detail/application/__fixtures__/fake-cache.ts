import type { DetailCachePort } from '../ports'

export type FakeDetailCache = DetailCachePort & {
  invalidatedKeys: () => readonly string[]
}

export function createFakeDetailCache(): FakeDetailCache {
  const keys: string[] = []
  return {
    invalidateIssue: (key) => {
      keys.push(key)
    },
    invalidatedKeys: () => keys,
  }
}

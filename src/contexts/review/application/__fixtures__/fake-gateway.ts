import type { GetReviewCardsResult } from '~/kernel'
import type { ReviewGateway } from '../ports'

export type FakeReviewGateway = ReviewGateway & {
  setResult: (r: GetReviewCardsResult) => void
  setError: (e: Error) => void
  callCount: () => number
}

export function createFakeReviewGateway(): FakeReviewGateway {
  let nextResult: GetReviewCardsResult | null = null
  let nextError: Error | null = null
  let calls = 0
  return {
    loadReviewCards: () => {
      calls++
      if (nextError !== null) return Promise.reject(nextError)
      if (nextResult === null) {
        return Promise.reject(new Error('FakeReviewGateway: no result configured'))
      }
      return Promise.resolve(nextResult)
    },
    setResult: (r) => {
      nextResult = r
      nextError = null
    },
    setError: (e) => {
      nextError = e
      nextResult = null
    },
    callCount: () => calls,
  }
}

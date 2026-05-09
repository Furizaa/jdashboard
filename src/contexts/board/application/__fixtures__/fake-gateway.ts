import type { SearchIssuesResult } from '~/kernel'
import type { BoardGateway } from '../ports'

export type FakeBoardGateway = BoardGateway & {
  setResult: (r: SearchIssuesResult) => void
  setError: (e: Error) => void
  callCount: () => number
}

export function createFakeBoardGateway(): FakeBoardGateway {
  let nextResult: SearchIssuesResult | null = null
  let nextError: Error | null = null
  let calls = 0
  return {
    loadBoard: () => {
      calls++
      if (nextError !== null) return Promise.reject(nextError)
      if (nextResult === null) {
        return Promise.reject(new Error('FakeBoardGateway: no result configured'))
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
